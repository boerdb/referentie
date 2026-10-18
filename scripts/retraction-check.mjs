#!/usr/bin/env node
/**
 * Controleert bij Crossref (Retraction Watch) of artikelen zijn teruggetrokken.
 * Kijkt naar artikelen met een DOI die nooit of meer dan 7 dagen geleden zijn gecontroleerd.
 *
 *   npm run retractions:check            # max. 400 per keer
 *   npm run retractions:check -- --all   # alles opnieuw
 */
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const all = process.argv.includes("--all");

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

const PRIORITY = ["retraction", "withdrawal", "expression_of_concern"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function check(doi) {
  const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=support@clvs.nl`, {
    headers: { "User-Agent": "ReferentiePWA/1.0 (mailto:support@clvs.nl)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const notices = (data.message?.["updated-by"] ?? []).filter((u) => PRIORITY.includes(u.type));
  if (notices.length === 0) return null;
  notices.sort((a, b) => PRIORITY.indexOf(a.type) - PRIORITY.indexOf(b.type));
  const p = notices[0].updated?.["date-parts"]?.[0];
  const date = p?.length ? `${p[0]}-${String(p[1] ?? 1).padStart(2, "0")}-${String(p[2] ?? 1).padStart(2, "0")}` : null;
  return { type: notices[0].type, doi: notices[0].DOI ?? null, date };
}

const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL });
try {
  const [rows] = await conn.query(
    `SELECT id, doi, title FROM ref_items
     WHERE deleted_at IS NULL AND doi IS NOT NULL AND doi <> ''
       ${all ? "" : "AND (retraction_checked_at IS NULL OR retraction_checked_at < NOW() - INTERVAL 7 DAY)"}
     ORDER BY retraction_checked_at IS NOT NULL, retraction_checked_at
     LIMIT 400`,
  );
  console.log(`${rows.length} artikel(en) te controleren.`);
  let flagged = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const info = await check(row.doi);
      await conn.query(
        `UPDATE ref_items SET retraction_type = ?, retraction_doi = ?, retraction_date = ?,
           retraction_checked_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [info?.type ?? null, info?.doi ?? null, info?.date ?? null, row.id],
      );
      if (info) {
        flagged += 1;
        console.log(`  ⚠ ${info.type}: ${row.title.slice(0, 80)}`);
      }
    } catch (e) {
      failed += 1;
      console.warn(`  ✗ ${row.doi}: ${e instanceof Error ? e.message : e}`);
    }
    await sleep(150);
  }
  console.log(`Klaar: ${flagged} met melding, ${failed} niet gelukt.`);
} finally {
  await conn.end();
}
