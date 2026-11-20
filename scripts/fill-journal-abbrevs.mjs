#!/usr/bin/env node
/**
 * Vult ontbrekende tijdschriftafkortingen (journal_abbrev, bijv. "N Engl J Med") aan.
 * Per tijdschrift: eerst een afkorting die al in de bibliotheek staat, dan Crossref
 * (short-container-title via een DOI uit dat tijdschrift), dan de NLM Catalog.
 *
 *   npm run journals:abbrev                # alle artikelen zonder afkorting
 *   npm run journals:abbrev -- --recent    # alleen artikelen van de laatste 3 dagen (cron)
 *   npm run journals:abbrev -- --dry-run   # alleen tonen
 */
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const recent = process.argv.includes("--recent");
const dryRun = process.argv.includes("--dry-run");
const USER_AGENT = "ReferentiePWA/1.0 (mailto:support@clvs.nl)";
const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") process.env[key] = value;
  }
}

loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(root, ".env"));
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is niet gezet.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (message) => console.log(`${new Date().toISOString()} ${message}`);

/** Zelfde als normalizeJournalTitle in lib/doi/journal-abbrev.ts. */
function normalizeJournalTitle(title) {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Ondertitel weg: "Critical care : the official journal of …" → "critical care".
    .replace(/\s*:\s.*$/, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "");
}

/** Zelfde als isPlausibleAbbrev in lib/doi/journal-abbrev.ts. */
function isPlausibleAbbrev(abbrev, title) {
  const clean = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ");
  const tokens = clean(abbrev).split(/[^a-z0-9]+/).filter(Boolean);
  const words = clean(title).split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.length === 0) return false;
  let at = 0;
  for (const token of tokens) {
    while (at < words.length && !words[at].startsWith(token)) at += 1;
    if (at >= words.length) return false;
    at += 1;
  }
  return true;
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} (${new URL(url).host})`);
  return res.json();
}

async function fromCrossref(doi, wanted) {
  const data = await getJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=support@clvs.nl`, {
    "User-Agent": USER_AGENT,
  });
  const work = data?.message;
  if (!work) return null;
  // Alleen als Crossref hetzelfde tijdschrift noemt.
  const title = work["container-title"]?.[0];
  if (!title || normalizeJournalTitle(title) !== wanted) return null;
  const short = work["short-container-title"]?.[0]?.trim();
  return short && normalizeJournalTitle(short) !== wanted && isPlausibleAbbrev(short, title) ? short : null;
}

/** Zelfde als STOPWORDS in lib/doi/journal-abbrev.ts. */
const STOPWORDS = new Set(["and", "of", "the", "for", "in", "on", "a", "an", "to", "de", "des", "du", "la", "le", "et", "und", "fur", "der", "die", "das"]);

/** Zoekterm per woord ("&" en leestekens breken een zinszoekopdracht in de NLM Catalog). */
function nlmTitleTerm(wanted) {
  const words = wanted.split(" ").filter((w) => w && !STOPWORDS.has(w));
  return `${words.map((w) => `${w}[Title]`).join(" AND ")} AND ncbijournals[filter]`;
}

async function searchNlm(term, wanted) {
  const search = await getJson(
    `${EUTILS}/esearch.fcgi?db=nlmcatalog&retmode=json&retmax=200&tool=referentie&term=${encodeURIComponent(term)}`,
  );
  const ids = search?.esearchresult?.idlist ?? [];
  if (ids.length === 0) return null;
  await sleep(400);
  const res = await fetch(`${EUTILS}/esummary.fcgi`, {
    method: "POST",
    body: new URLSearchParams({ db: "nlmcatalog", retmode: "json", tool: "referentie", id: ids.join(",") }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} (NLM)`);
  const result = (await res.json())?.result ?? {};
  const matches = (result.uids ?? ids)
    .map((uid) => result[uid])
    .filter((entry) => {
      if (!entry?.medlineta) return false;
      // Alleen de hoofdtitel: alternatieve titels zijn vaak voorgangers (andere afkorting).
      return (entry.titlemainlist ?? []).some((t) => normalizeJournalTitle(t.title ?? "") === wanted);
    });
  // Zelfde keuze als pickCatalogEntry in lib/doi/journal-abbrev.ts.
  for (const subset of [
    matches,
    matches.filter((m) => m.currentindexingstatus === "Y"),
    matches.filter((m) => m.endyear === "9999"),
    // Zelfde naam, kleiner blad met plaatsnaam ("J Clin Med (Chestert)"): de afkorting zonder plaats.
    matches.filter((m) => m.endyear === "9999" && !m.medlineta?.includes("(")),
  ]) {
    if (subset.length === 1) return subset[0].medlineta.trim() || null;
  }
  return null;
}

/** Zelfde volgorde als lookupAtNlm in lib/doi/journal-abbrev.ts. */
async function fromNlm(journal, wanted) {
  const first = await searchNlm(`${nlmTitleTerm(wanted)} AND currentlyindexed[All]`, wanted);
  if (first) return first;
  await sleep(400);
  return searchNlm(nlmTitleTerm(wanted), wanted);
}

const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL, charset: "utf8mb4" });
try {
  const [missing] = await conn.query(
    `SELECT id, journal, doi FROM ref_items
     WHERE journal IS NOT NULL AND journal <> ''
       AND (journal_abbrev IS NULL OR journal_abbrev = '')
       ${recent ? "AND created_at >= NOW() - INTERVAL 3 DAY" : ""}`,
  );
  if (missing.length === 0) {
    log("Geen artikelen zonder tijdschriftafkorting.");
    process.exit(0);
  }

  // Afkortingen die al in de database staan (meest gebruikte per tijdschrift).
  const [known] = await conn.query(
    `SELECT journal, journal_abbrev, COUNT(*) AS n FROM ref_items
     WHERE journal IS NOT NULL AND journal_abbrev IS NOT NULL AND journal_abbrev <> ''
     GROUP BY journal, journal_abbrev ORDER BY n DESC`,
  );
  const knownByJournal = new Map();
  for (const row of known) {
    const key = normalizeJournalTitle(row.journal);
    if (key && !knownByJournal.has(key)) knownByJournal.set(key, row.journal_abbrev);
  }

  /** @type {Map<string, { journal: string, ids: string[], dois: string[] }>} */
  const journals = new Map();
  for (const row of missing) {
    const key = normalizeJournalTitle(row.journal);
    if (!key) continue;
    const entry = journals.get(key) ?? { journal: row.journal, ids: [], dois: [] };
    entry.ids.push(row.id);
    if (row.doi) entry.dois.push(row.doi);
    journals.set(key, entry);
  }
  log(`${missing.length} artikel(en) zonder afkorting, ${journals.size} tijdschrift(en)${dryRun ? " (dry-run)" : ""}.`);

  let filled = 0;
  let notFound = 0;
  for (const [key, entry] of journals) {
    let abbrev = knownByJournal.get(key) ?? null;
    let source = "bibliotheek";
    try {
      if (!abbrev && entry.dois.length) {
        source = "Crossref";
        abbrev = await fromCrossref(entry.dois[0], key);
        await sleep(200);
      }
      if (!abbrev) {
        source = "NLM";
        abbrev = await fromNlm(entry.journal, key);
        await sleep(400);
      }
    } catch (e) {
      log(`Fout bij "${entry.journal}": ${e instanceof Error ? e.message : e}`);
      continue;
    }
    if (!abbrev) {
      notFound += 1;
      log(`Niet gevonden: ${entry.journal}`);
      continue;
    }
    abbrev = abbrev.slice(0, 255);
    log(`${entry.journal} → ${abbrev} (${source}, ${entry.ids.length} artikel(en))`);
    if (!dryRun) {
      await conn.query(
        `UPDATE ref_items SET journal_abbrev = ?
         WHERE id IN (?) AND (journal_abbrev IS NULL OR journal_abbrev = '')`,
        [abbrev, entry.ids],
      );
    }
    filled += entry.ids.length;
  }
  log(`Klaar: ${filled} artikel(en) aangevuld, ${notFound} tijdschrift(en) niet gevonden.`);
} finally {
  await conn.end();
}
