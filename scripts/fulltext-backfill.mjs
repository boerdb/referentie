#!/usr/bin/env node
/**
 * Vult de doorzoekbare tekst (attachments.full_text) aan voor PDF's die nog niet zijn geïndexeerd.
 * Nieuwe uploads worden automatisch geïndexeerd; dit is voor bestaande bestanden.
 *
 *   npm run fulltext:backfill
 *
 * Veilig om vaker te draaien: alleen bijlagen zonder tekst worden bekeken.
 */
import { existsSync, readFileSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
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
    if (process.env[key] == null || process.env[key] === "") process.env[key] = value;
  }
}

loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(root, ".env"));

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is niet gezet.");
  process.exit(1);
}

function uploadRoot() {
  const custom = process.env.UPLOAD_DIR?.trim();
  if (custom && path.isAbsolute(custom)) return custom;
  if (custom) return path.join(root, custom);
  return path.join(root, "data", "pdfs");
}

const MAX_PAGES = 400;
const MAX_CHARS = 2_000_000;

async function extract(data) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, disableAutoFetch: true, verbosity: 0 }).promise;
  const parts = [];
  let length = 0;
  try {
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES) && length < MAX_CHARS; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      parts.push(text);
      length += text.length;
      page.cleanup();
    }
    return { text: parts.join("\n").slice(0, MAX_CHARS), pageCount: doc.numPages };
  } finally {
    await doc.destroy();
  }
}

const conn = await mysql.createConnection({ uri: url });
try {
  const [rows] = await conn.query(
    "SELECT id, storage_path, original_name FROM attachments WHERE full_text IS NULL ORDER BY created_at",
  );
  console.log(`${rows.length} bijlage(n) zonder tekst.`);
  let done = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const data = new Uint8Array(await readFile(path.join(uploadRoot(), row.storage_path)));
      const { text, pageCount } = await extract(data);
      // Lege tekst (gescande PDF) als "" opslaan, zodat hij niet steeds opnieuw wordt geprobeerd.
      await conn.query("UPDATE attachments SET full_text = ?, page_count = ? WHERE id = ?", [
        text,
        pageCount,
        row.id,
      ]);
      done += 1;
      console.log(`  ✓ ${row.original_name} (${pageCount} p., ${text.length} tekens)`);
    } catch (e) {
      failed += 1;
      console.warn(`  ✗ ${row.original_name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`Klaar: ${done} geïndexeerd, ${failed} mislukt.`);
} finally {
  await conn.end();
}
