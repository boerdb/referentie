import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(root, "sql", "schema.sql");
const url = process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = readFileSync(schemaPath, "utf8");
const statements = sql
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"));

const conn = await mysql.createConnection({ uri: url, multipleStatements: true });

try {
  for (const stmt of statements) {
    await conn.query(stmt);
  }
  console.log("Schema applied:", schemaPath);
} finally {
  await conn.end();
}
