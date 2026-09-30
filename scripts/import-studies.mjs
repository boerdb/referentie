#!/usr/bin/env node
/**
 * Importeert het studies-manifest (icu-studies) in de Referentie-bibliotheek.
 *
 * Bron: STUDIES_DIR/manifest.json (standaard /var/www/icu-studies, lokaal C:\studies).
 * PDF's worden gekopieerd naar UPLOAD_DIR/{userId}/{attachmentId}.pdf.
 * Bekende DOI's worden overgeslagen. Ontbreekt alleen de PDF, dan wordt die alsnog gekoppeld.
 * De botsamenvatting komt in notes; auteurs, volume, pagina's en abstract komen van Crossref.
 *
 * Draai dit op de server waar zowel de studies-map als de uploadmap staan.
 *   node scripts/import-studies.mjs
 *   node scripts/import-studies.mjs --dry-run
 */
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { copyFile, mkdir, readFile, stat, unlink } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");
const MAX_PDF_BYTES = 50 * 1024 * 1024;
const LOOKUP_MS = 15_000;
const USER_AGENT = "ReferentiePWA/1.0 (mailto:support@clvs.nl)";

function log(message) {
  const stamp = new Date().toISOString();
  console.log(`${stamp} ${message}`);
}

function loadEnvFile(filePath) {
  let text;
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

function studiesDir() {
  const fromEnv = process.env.STUDIES_DIR?.trim();
  if (fromEnv) return fromEnv;
  return process.platform === "win32" ? "C:\\studies" : "/var/www/icu-studies";
}

function uploadRoot() {
  const custom = process.env.UPLOAD_DIR?.trim();
  if (custom && path.isAbsolute(custom)) return custom;
  if (custom) return path.resolve(root, custom);
  return path.join(root, "data", "pdfs");
}

function normalizeDoi(raw) {
  return String(raw)
    .trim()
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "")
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim();
}

function cleanDoi(raw) {
  let d = normalizeDoi(raw);
  d = (d.split(/[?#]/)[0] ?? d).trim();
  d = d.replace(/\.pdf$/i, "");
  d = d.replace(
    /\/+(pdf|epdf|fulltext|full|abstract|html|download|meta|suppl|supplementary)\/?$/i,
    "",
  );
  d = d.replace(/[.,;:)\]}>]+$/g, "");
  return d;
}

function doiCandidates(raw) {
  const cleaned = cleanDoi(raw);
  const base = (normalizeDoi(raw).split(/[?#]/)[0] ?? "").trim();
  const out = [];
  for (const value of [cleaned, base]) {
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

function yearFromPublishedAt(value) {
  const year = Number(String(value ?? "").slice(0, 4));
  return year > 1000 ? year : null;
}

function yearFromCrossref(work) {
  const bags = [
    work.issued,
    work.published,
    work["published-print"],
    work["published-online"],
    work.created,
  ];
  for (const bag of bags) {
    const year = bag?.["date-parts"]?.[0]?.[0];
    if (typeof year === "number" && year > 1000) return year;
  }
  return null;
}

function stripAbstractHtml(html) {
  return html
    .replace(/<\/(?:jats:)?title>/gi, ": ")
    .replace(/<\/h[1-6]>/gi, ": ")
    .replace(/<\/(?:jats:)?(?:p|sec|abstract)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .replace(/\s+([:;,.])/g, "$1")
    .trim();
}

function sanitizeFileName(name) {
  return name.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 200);
}

function resolveStudyPdf(studiesRoot, relativePdf) {
  if (typeof relativePdf !== "string") return null;
  const rel = relativePdf.trim();
  if (!rel || rel.includes("\0") || path.isAbsolute(rel)) return null;
  const base = path.resolve(studiesRoot);
  const absolute = path.resolve(base, rel);
  const fromRoot = path.relative(base, absolute);
  if (!fromRoot || fromRoot.startsWith("..") || path.isAbsolute(fromRoot)) {
    return null;
  }
  if (!absolute.toLowerCase().endsWith(".pdf")) return null;
  return absolute;
}

function noteBody(study) {
  const parts = [];
  const summary = study.summary?.trim();
  if (summary) parts.push(summary);
  if (Array.isArray(study.tags) && study.tags.length) {
    parts.push(`Tags: ${study.tags.join(", ")}`);
  }
  if (study.id) parts.push(`Bron: icu-studies/${study.id}`);
  return parts.join("\n\n");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, headers) {
  let res = await fetch(url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(LOOKUP_MS),
  });
  if (res.status === 429 || res.status === 503) {
    await sleep(2000);
    res = await fetch(url, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(LOOKUP_MS),
    });
  }
  return res;
}

async function lookupCrossref(doi) {
  const headers = { Accept: "application/json", "User-Agent": USER_AGENT };
  const encoded = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  const raw = `https://api.crossref.org/works/${doi}`;
  const urls = encoded === raw ? [encoded] : [encoded, raw];
  let lastStatus = 0;
  for (const url of urls) {
    const res = await fetchJson(url, headers);
    lastStatus = res.status;
    if (res.status === 404 || !res.ok) continue;
    const json = await res.json();
    if (!json?.message) continue;
    const work = json.message;
    const abstract = work.abstract ? stripAbstractHtml(work.abstract) : null;
    return {
      title: work.title?.[0]?.trim() || null,
      abstract,
      year: yearFromCrossref(work),
      journal: work["container-title"]?.[0]?.trim() || null,
      volume: work.volume ?? null,
      issue: work.issue ?? null,
      pages: work.page ?? null,
      doi: work.DOI ? cleanDoi(work.DOI) : null,
      url: work.URL ?? null,
      authors: Array.isArray(work.author)
        ? work.author.map((author) => ({
            givenName: author.given ?? "",
            familyName: author.family ?? "",
          }))
        : [],
    };
  }
  if (lastStatus === 404) return null;
  throw new Error(`Crossref gaf HTTP ${lastStatus || "geen antwoord"}`);
}

async function lookupDoiOrg(doi) {
  const res = await fetchJson(`https://doi.org/${encodeURI(doi)}`, {
    Accept: "application/vnd.citationstyles.csl+json",
    "User-Agent": USER_AGENT,
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`doi.org gaf HTTP ${res.status}`);
  }
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("json")) return null;
  const work = await res.json();
  const title = Array.isArray(work.title) ? work.title[0] : work.title;
  const journal = Array.isArray(work["container-title"])
    ? work["container-title"][0]
    : work["container-title"];
  return {
    title: title?.trim() || null,
    abstract: work.abstract ? stripAbstractHtml(work.abstract) : null,
    year: yearFromCrossref(work),
    journal: journal?.trim() || null,
    volume: work.volume != null ? String(work.volume) : null,
    issue: work.issue != null ? String(work.issue) : null,
    pages: work.page ?? null,
    doi: work.DOI ? cleanDoi(work.DOI) : null,
    url: work.URL ?? null,
    authors: Array.isArray(work.author)
      ? work.author.map((author) => ({
          givenName: author.given ?? "",
          familyName: author.family ?? "",
        }))
      : [],
  };
}

async function lookupAbstract(doi) {
  const query = encodeURIComponent(`DOI:"${doi}"`);
  try {
    const epmc = await fetchJson(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${query}&resultType=core&format=json&pageSize=1`,
      { Accept: "application/json" },
    );
    if (epmc.ok) {
      const json = await epmc.json();
      const text = json?.resultList?.result?.[0]?.abstractText;
      if (text && stripAbstractHtml(text).length >= 40) {
        return stripAbstractHtml(text);
      }
    }
  } catch {
    /* volgende bron */
  }

  try {
    const openAlex = await fetchJson(
      `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}?mailto=support@clvs.nl`,
      { Accept: "application/json" },
    );
    if (!openAlex.ok) return null;
    const json = await openAlex.json();
    const index = json?.abstract_inverted_index;
    if (!index) return null;
    const words = [];
    for (const [word, positions] of Object.entries(index)) {
      for (const position of positions) words[position] = word;
    }
    const text = words.filter((word) => word != null).join(" ").trim();
    return text.length >= 40 ? text : null;
  } catch {
    return null;
  }
}

async function fetchMetadata(doiRaw) {
  const candidates = doiCandidates(doiRaw);
  let lastError = null;
  for (const doi of candidates) {
    try {
      let meta = await lookupCrossref(doi);
      if (!meta) meta = await lookupDoiOrg(doi);
      if (!meta) continue;
      if (!meta.abstract) {
        meta.abstract = await lookupAbstract(meta.doi || doi);
      }
      return meta;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return null;
}

async function resolveUser(conn) {
  const email = process.env.IMPORT_USER_EMAIL?.trim();
  if (email) {
    const [rows] = await conn.query(
      "SELECT id, email FROM users WHERE email = ? LIMIT 1",
      [email],
    );
    if (!rows[0]) {
      throw new Error(`Geen gebruiker met e-mail ${email}.`);
    }
    return rows[0];
  }

  const [rows] = await conn.query(
    "SELECT id, email, role FROM users ORDER BY created_at",
  );
  if (rows.length === 1) return rows[0];
  const admins = rows.filter((row) => row.role === "admin");
  if (admins.length === 1) return admins[0];
  if (rows.length === 0) {
    throw new Error("Geen gebruikers in de database. Zet IMPORT_USER_EMAIL.");
  }
  throw new Error(
    "Meerdere gebruikers. Zet IMPORT_USER_EMAIL in .env.local op het account dat de studies moet krijgen.",
  );
}

async function findExisting(conn, userId, study, doi) {
  if (doi) {
    const lowered = doiCandidates(doi).map((value) => value.toLowerCase());
    const placeholders = lowered.map(() => "?").join(", ");
    const [rows] = await conn.query(
      `SELECT id FROM ref_items
       WHERE user_id = ? AND LOWER(doi) IN (${placeholders})
       LIMIT 1`,
      [userId, ...lowered],
    );
    if (rows[0]) return rows[0].id;
  }

  const title = study.title?.trim();
  if (!title || doi) return null;
  const [rows] = await conn.query(
    "SELECT id FROM ref_items WHERE user_id = ? AND title = ? LIMIT 1",
    [userId, title],
  );
  return rows[0]?.id ?? null;
}

async function hasAttachment(conn, referenceId) {
  const [rows] = await conn.query(
    "SELECT id FROM attachments WHERE reference_id = ? LIMIT 1",
    [referenceId],
  );
  return Boolean(rows[0]);
}

async function attachPdf(conn, userId, referenceId, pdfPath, label) {
  let info;
  try {
    info = await stat(pdfPath);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      log(`pdf ontbreekt ${label}`);
      return false;
    }
    throw error;
  }
  if (!info.isFile()) {
    log(`geen bestand ${label}`);
    return false;
  }
  if (info.size > MAX_PDF_BYTES) {
    log(`PDF te groot (>50 MB), overgeslagen: ${label}`);
    return false;
  }
  if (await hasAttachment(conn, referenceId)) return false;

  const attachmentId = randomUUID();
  const storagePath = `${userId}/${attachmentId}.pdf`;
  const destination = path.join(uploadRoot(), userId, `${attachmentId}.pdf`);
  if (dryRun) {
    log(`zou pdf kopiëren ${label} -> ${storagePath}`);
    return true;
  }

  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(pdfPath, destination);
  try {
    await conn.query(
      `INSERT INTO attachments (id, reference_id, original_name, storage_path, mime, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        attachmentId,
        referenceId,
        sanitizeFileName(path.basename(pdfPath)),
        storagePath,
        "application/pdf",
        info.size,
      ],
    );
  } catch (error) {
    await unlink(destination).catch(() => {});
    throw error;
  }
  log(`pdf gekoppeld ${label}`);
  return true;
}

async function insertReference(conn, userId, study, meta, doi) {
  const id = randomUUID();
  const title = study.title?.trim() || meta?.title || "Zonder titel";
  const year = meta?.year ?? yearFromPublishedAt(study.publishedAt);
  const journal = study.source?.trim() || meta?.journal || null;
  const url = study.url?.trim() || meta?.url || null;
  const citeKey = String(study.id ?? "").trim().slice(0, 128) || null;

  await conn.query(
    `INSERT INTO ref_items (
      id, user_id, type, title, abstract, year, journal, volume, issue, pages,
      doi, url, pmid, cite_key, status, starred
    ) VALUES (?, ?, 'article', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'unread', 0)`,
    [
      id,
      userId,
      title,
      meta?.abstract || null,
      year,
      journal,
      meta?.volume ? String(meta.volume) : null,
      meta?.issue ? String(meta.issue) : null,
      meta?.pages ? String(meta.pages) : null,
      doi || meta?.doi || null,
      url,
      citeKey,
    ],
  );

  const authors = meta?.authors?.filter(
    (author) => author.givenName?.trim() || author.familyName?.trim(),
  );
  if (authors?.length) {
    for (let i = 0; i < authors.length; i++) {
      const authorId = randomUUID();
      await conn.query(
        "INSERT INTO authors (id, given_name, family_name) VALUES (?, ?, ?)",
        [authorId, authors[i].givenName.trim(), authors[i].familyName.trim()],
      );
      await conn.query(
        "INSERT INTO reference_authors (reference_id, author_id, position) VALUES (?, ?, ?)",
        [id, authorId, i],
      );
    }
  }

  const body = noteBody(study);
  if (body) {
    await conn.query(
      "INSERT INTO notes (id, reference_id, body) VALUES (?, ?, ?)",
      [randomUUID(), id, body],
    );
  }

  return id;
}

async function main() {
  loadEnvFile(path.join(root, ".env.local"));
  loadEnvFile(path.join(root, ".env"));

  if (!process.env.DATABASE_URL?.trim()) {
    console.error("DATABASE_URL ontbreekt.");
    process.exit(1);
  }

  const dir = studiesDir();
  const manifestPath = path.join(dir, "manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      log(`Geen manifest: ${manifestPath} — import overgeslagen.`);
      return;
    }
    throw error;
  }

  const studies = Array.isArray(manifest.studies) ? manifest.studies : [];
  log(
    `Import start${dryRun ? " (dry-run)" : ""}: ${studies.length} studie(s), manifest ${manifest.generatedAt ?? "onbekend"}`,
  );

  const conn = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    charset: "utf8mb4",
  });

  let created = 0;
  let pdfs = 0;
  let skipped = 0;
  let failed = 0;

  try {
    const user = await resolveUser(conn);
    log(`Bibliotheek: ${user.email}`);

    for (const study of studies) {
      const label = study.id || study.title || "(zonder id)";
      const doi = study.doi ? cleanDoi(study.doi) : "";
      const pdfPath = resolveStudyPdf(dir, study.pdf);
      try {
        const existingId = await findExisting(conn, user.id, study, doi);
        if (existingId) {
          skipped += 1;
          if (pdfPath) {
            const linked = await attachPdf(conn, user.id, existingId, pdfPath, label);
            if (linked) pdfs += 1;
          }
          continue;
        }

        if (!study.title?.trim() && !doi) {
          log(`overgeslagen (geen titel of DOI) ${label}`);
          skipped += 1;
          continue;
        }

        let meta = null;
        if (doi && !dryRun) {
          try {
            meta = await fetchMetadata(doi);
            await sleep(250);
          } catch (error) {
            log(
              `metadata mislukt voor ${label}: ${error instanceof Error ? error.message : error}`,
            );
          }
        }

        if (dryRun) {
          log(`zou invoegen ${label}${doi ? ` (${doi})` : ""}`);
          created += 1;
          if (pdfPath) {
            const linked = await attachPdf(conn, user.id, "dry-run", pdfPath, label);
            if (linked) pdfs += 1;
          }
          continue;
        }

        await conn.beginTransaction();
        try {
          const referenceId = await insertReference(conn, user.id, study, meta, doi);
          if (pdfPath) {
            const linked = await attachPdf(conn, user.id, referenceId, pdfPath, label);
            if (linked) pdfs += 1;
          }
          await conn.commit();
          created += 1;
          log(`ingevoegd ${label}`);
        } catch (error) {
          await conn.rollback();
          throw error;
        }
      } catch (error) {
        failed += 1;
        log(`FOUT ${label}: ${error instanceof Error ? error.message : error}`);
      }
    }
  } finally {
    await conn.end();
  }

  log(
    `Import klaar: ${created} nieuw, ${pdfs} pdf, ${skipped} al aanwezig, ${failed} fout(en).`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
