import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db/mysql";
import { looksLikePdfFile } from "./is-pdf";

export { looksLikePdfFile };

const PDF_ROOT = path.join(process.cwd(), "data", "pdfs");

/**
 * Uploads staan buiten de bundel en het pad is pas op runtime bekend (UPLOAD_DIR).
 * Zonder `turbopackIgnore` traceert de build daarom het hele project mee.
 */
export function getUploadRoot(): string {
  const custom = process.env.UPLOAD_DIR?.trim();
  if (custom && path.isAbsolute(custom)) return custom;
  if (custom) return path.join(/* turbopackIgnore: true */ process.cwd(), custom);
  return PDF_ROOT;
}

const MAX_PDF_BYTES = 50 * 1024 * 1024;

export async function referenceHasPdf(
  userId: string,
  referenceId: string,
): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok FROM attachments a
     JOIN ref_items r ON r.id = a.reference_id
     WHERE a.reference_id = ? AND r.user_id = ?
     LIMIT 1`,
    [referenceId, userId],
  );
  return rows.length > 0;
}

export async function savePdfBufferForReference(
  userId: string,
  referenceId: string,
  buffer: Buffer,
  originalName: string,
): Promise<{ attachmentId: string; storagePath: string }> {
  if (buffer.length > MAX_PDF_BYTES) {
    throw new Error("PDF is groter dan 50 MB.");
  }
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new Error("Alleen PDF-bestanden zijn toegestaan.");
  }

  const attachmentId = randomUUID();
  const dir = path.join(/* turbopackIgnore: true */ getUploadRoot(), userId);
  await mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  const fileName = `${attachmentId}.pdf`;
  const absPath = path.join(/* turbopackIgnore: true */ dir, fileName);
  await writeFile(/* turbopackIgnore: true */ absPath, buffer);

  const storagePath = path.join(userId, fileName).replace(/\\/g, "/");
  const pool = getPool();

  const [previous] = await pool.query<AttRow[]>(
    "SELECT storage_path FROM attachments WHERE reference_id = ?",
    [referenceId],
  );

  await pool.query("DELETE FROM attachments WHERE reference_id = ?", [
    referenceId,
  ]);

  await pool.query(
    `INSERT INTO attachments (id, reference_id, original_name, storage_path, mime, size_bytes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      attachmentId,
      referenceId,
      sanitizeFileName(originalName),
      storagePath,
      "application/pdf",
      buffer.length,
    ],
  );

  // Het oude bestand pas weghalen nadat de nieuwe bijlage in de database staat.
  for (const row of previous) await unlinkStored(row.storage_path);

  return { attachmentId, storagePath };
}

async function unlinkStored(storagePath: string): Promise<void> {
  try {
    await unlink(
      path.join(/* turbopackIgnore: true */ getUploadRoot(), storagePath),
    );
  } catch {
    /* ignore missing file */
  }
}

export async function savePdfForReference(
  userId: string,
  referenceId: string,
  file: File,
): Promise<{ attachmentId: string; storagePath: string }> {
  if (!looksLikePdfFile(file)) {
    throw new Error("Alleen PDF-bestanden zijn toegestaan.");
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new Error("PDF is groter dan 50 MB.");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return savePdfBufferForReference(userId, referenceId, buffer, file.name);
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 200);
}

type AttRow = RowDataPacket & {
  id: string;
  storage_path: string;
  original_name: string;
  reference_id: string;
  user_id: string;
};

export async function getPdfForUser(
  userId: string,
  referenceId: string,
): Promise<{ buffer: Buffer; fileName: string } | null> {
  const pool = getPool();
  const [rows] = await pool.query<AttRow[]>(
    `SELECT a.id, a.storage_path, a.original_name, a.reference_id, r.user_id
     FROM attachments a
     JOIN ref_items r ON r.id = a.reference_id
     WHERE a.reference_id = ? AND r.user_id = ?
     LIMIT 1`,
    [referenceId, userId],
  );
  const row = rows[0];
  if (!row) return null;
  const absPath = path.join(
    /* turbopackIgnore: true */ getUploadRoot(),
    row.storage_path,
  );
  const buffer = await readFile(/* turbopackIgnore: true */ absPath);
  return { buffer, fileName: row.original_name || "document.pdf" };
}

export async function deletePdfFilesForReference(
  userId: string,
  referenceId: string,
): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.query<AttRow[]>(
    `SELECT a.storage_path FROM attachments a
     JOIN ref_items r ON r.id = a.reference_id
     WHERE a.reference_id = ? AND r.user_id = ?`,
    [referenceId, userId],
  );
  for (const row of rows) await unlinkStored(row.storage_path);
}
