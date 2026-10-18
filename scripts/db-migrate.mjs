#!/usr/bin/env node
/**
 * Voert de nog niet toegepaste migraties uit sql/migrations/ uit, op volgorde van bestandsnaam.
 * Toegepaste migraties staan in de tabel schema_migrations.
 *
 *   npm run db:migrate            # toepassen
 *   npm run db:migrate -- --status   # alleen tonen wat er nog openstaat
 *
 * DATABASE_URL komt uit de omgeving, anders uit .env.local / .env.
 * Let op: DDL in MariaDB is niet terug te draaien. Maak vooraf een back-up.
 */
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "sql", "migrations");
const statusOnly = process.argv.includes("--status");

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

/** Splitst op `;` aan het eind van een regel; regels met `--` zijn commentaar. */
function splitStatements(sql) {
  const statements = [];
  let current = [];
  for (const line of sql.split(/\r?\n/)) {
    if (line.trim().startsWith("--")) continue;
    current.push(line);
    if (line.trimEnd().endsWith(";")) {
      const stmt = current.join("\n").trim().replace(/;$/, "").trim();
      if (stmt) statements.push(stmt);
      current = [];
    }
  }
  const rest = current.join("\n").trim();
  if (rest) statements.push(rest);
  return statements;
}

loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(root, ".env"));

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is niet gezet (omgeving of .env.local).");
  process.exit(1);
}

const files = readdirSync(migrationsDir)
  .filter((name) => /^\d{3}_.+\.sql$/.test(name))
  .sort();

const conn = await mysql.createConnection({ uri: url });

try {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`,
  );
  const [rows] = await conn.query("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((row) => row.name));
  const pending = files.filter((name) => !applied.has(name));

  if (pending.length === 0) {
    console.log("Database is bij: geen openstaande migraties.");
  } else if (statusOnly) {
    console.log("Openstaande migraties:");
    for (const name of pending) console.log(`  - ${name}`);
  } else {
    for (const name of pending) {
      const statements = splitStatements(readFileSync(path.join(migrationsDir, name), "utf8"));
      console.log(`==> ${name} (${statements.length} statements)`);
      for (const [i, stmt] of statements.entries()) {
        try {
          await conn.query(stmt);
        } catch (error) {
          console.error(`\nMigratie ${name} faalde bij statement ${i + 1}:\n${stmt}\n`);
          throw error;
        }
      }
      await conn.query("INSERT INTO schema_migrations (name) VALUES (?)", [name]);
    }
    console.log(`Klaar: ${pending.length} migratie(s) toegepast.`);
  }
} finally {
  await conn.end();
}
