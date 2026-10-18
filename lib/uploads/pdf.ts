import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db/mysql";
import { extractFullText } from "@/lib/pdf/extract-text";
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
const MAX_ATTACHMENTS = 20;

export type AttachmentInfo = {
  id: string;
  name: string;
  label: string | null;
  sizeBytes: number;
  pageCount: number | null;
  position: number;
  createdAt: string;
  /** Tekst geëxtraheerd en doorzoekbaar. */
  indexed: boolean;
};

export async function referenceHasPdf(
  userId: string,
  referenceId: string,
): Promise<boolean> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT 1 AS ok FROM attachments a
     JOIN ref_items r ON r.id = a.reference_id
     WHERE a.reference_id = ? AND r.user_id = ?
     LIMIT 1`,
    [referenceId, userId],
  );
  return rows.length > 0;
}

/** Tekst en paginatal opslaan; draait na het opslaan, zodat de upload niet wacht. */
async function indexAttachment(attachmentId: string, buffer: Buffer): Promise<void> {
  try {
    const { text, pageCount } = await extractFullText(new Uint8Array(buffer));
    await getPool().query("UPDATE attachments SET full_text = ?, page_count = ? WHERE id = ?", [
      text,
      pageCount,
      attachmentId,
    ]);
  } catch (e) {
    console.warn("[pdf-index]", attachmentId, e instanceof Error ? e.message : e);
  }
}

/**
 * Slaat een PDF op bij een artikel.
 * - `replace` (standaard): vervangt de hoofd-PDF; andere bijlagen blijven.
 * - anders: extra bijlage achteraan (bijv. supplement).
 */
export async function savePdfBufferForReference(
  userId: string,
  referenceId: string,
  buffer: Buffer,
  originalName: string,
  opts: { replace?: boolean; label?: string | null } = {},
): Promise<{ attachmentId: string; storagePath: string }> {
  const replace = opts.replace ?? true;
  if (buffer.length > MAX_PDF_BYTES) {
    throw new Error("PDF is groter dan 50 MB.");
  }
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new Error("Alleen PDF-bestanden zijn toegestaan.");
  }

  const pool = getPool();
  const [existing] = await pool.query<AttRow[]>(
    "SELECT id, storage_path, position FROM attachments WHERE reference_id = ? ORDER BY position, created_at",
    [referenceId],
  );
  if (!replace && existing.length >= MAX_ATTACHMENTS) {
    throw new Error(`Maximaal ${MAX_ATTACHMENTS} bijlagen per artikel.`);
  }

  const attachmentId = randomUUID();
  const dir = path.join(/* turbopackIgnore: true */ getUploadRoot(), userId);
  await mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  const fileName = `${attachmentId}.pdf`;
  await writeFile(/* turbopackIgnore: true */ path.join(dir, fileName), buffer);
  const storagePath = path.join(userId, fileName).replace(/\\/g, "/");

  const primary = existing[0];
  const position = replace ? (primary?.position ?? 0) : (existing.at(-1)?.position ?? -1) + 1;

  if (replace && primary) {
    await pool.query("DELETE FROM attachments WHERE id = ?", [primary.id]);
  }
  await pool.query(
    `INSERT INTO attachments (id, reference_id, original_name, storage_path, mime, size_bytes, position, label)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      attachmentId,
      referenceId,
      sanitizeFileName(originalName),
      storagePath,
      "application/pdf",
      buffer.length,
      position,
      opts.label?.trim().slice(0, 255) || null,
    ],
  );

  // Het oude bestand pas weghalen nadat de nieuwe bijlage in de database staat.
  if (replace && primary) await unlinkStored(primary.storage_path);
  void indexAttachment(attachmentId, buffer);

  return { attachmentId, storagePath };
}

async function unlinkStored(storagePath: string): Promise<void> {
  try {
    await unlink(path.join(/* turbopackIgnore: true */ getUploadRoot(), storagePath));
  } catch {
    /* ignore missing file */
  }
}

export async function savePdfForReference(
  userId: string,
  referenceId: string,
  file: File,
  opts?: { replace?: boolean; label?: string | null },
): Promise<{ attachmentId: string; storagePath: string }> {
  if (!looksLikePdfFile(file)) {
    throw new Error("Alleen PDF-bestanden zijn toegestaan.");
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new Error("PDF is groter dan 50 MB.");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return savePdfBufferForReference(userId, referenceId, buffer, file.name, opts);
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 200);
}

type AttRow = RowDataPacket & {
  id: string;
  storage_path: string;
  original_name: string;
  reference_id: string;
  position: number;
  label: string | null;
  size_bytes: number;
  page_count: number | null;
  created_at: Date;
  indexed: number;
};

async function readStored(storagePath: string): Promise<Buffer> {
  return readFile(/* turbopackIgnore: true */ path.join(getUploadRoot(), storagePath));
}

/** Hoofd-PDF van een artikel (eerste in de volgorde). */
export async function getPdfForUser(
  userId: string,
  referenceId: string,
): Promise<{ buffer: Buffer; fileName: string } | null> {
  const [rows] = await getPool().query<AttRow[]>(
    `SELECT a.storage_path, a.original_name
     FROM attachments a
     JOIN ref_items r ON r.id = a.reference_id
     WHERE a.reference_id = ? AND r.user_id = ?
     ORDER BY a.position, a.created_at
     LIMIT 1`,
    [referenceId, userId],
  );
  const row = rows[0];
  if (!row) return null;
  return { buffer: await readStored(row.storage_path), fileName: row.original_name || "document.pdf" };
}

/** Eén bijlage op id, alleen als die bij een artikel van deze gebruiker hoort. */
export async function getAttachmentFile(
  userId: string,
  attachmentId: string,
): Promise<{ buffer: Buffer; fileName: string; referenceId: string } | null> {
  const [rows] = await getPool().query<AttRow[]>(
    `SELECT a.storage_path, a.original_name, a.reference_id
     FROM attachments a
     JOIN ref_items r ON r.id = a.reference_id
     WHERE a.id = ? AND r.user_id = ?
     LIMIT 1`,
    [attachmentId, userId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    buffer: await readStored(row.storage_path),
    fileName: row.original_name || "document.pdf",
    referenceId: row.reference_id,
  };
}

export async function listAttachments(
  userId: string,
  referenceId: string,
): Promise<AttachmentInfo[]> {
  const [rows] = await getPool().query<AttRow[]>(
    `SELECT a.id, a.original_name, a.label, a.size_bytes, a.page_count, a.position, a.created_at,
            a.full_text IS NOT NULL AS indexed
     FROM attachments a
     JOIN ref_items r ON r.id = a.reference_id
     WHERE a.reference_id = ? AND r.user_id = ?
     ORDER BY a.position, a.created_at`,
    [referenceId, userId],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.original_name,
    label: row.label,
    sizeBytes: Number(row.size_bytes),
    pageCount: row.page_count,
    position: row.position,
    createdAt: row.created_at.toISOString(),
    indexed: Boolean(row.indexed),
  }));
}

/** Omschrijving wijzigen of als hoofd-PDF instellen. */
export async function updateAttachment(
  userId: string,
  attachmentId: string,
  input: { label?: string | null; makePrimary?: boolean },
): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.query<AttRow[]>(
    `SELECT a.id, a.reference_id FROM attachments a
     JOIN ref_items r ON r.id = a.reference_id
     WHERE a.id = ? AND r.user_id = ?`,
    [attachmentId, userId],
  );
  const row = rows[0];
  if (!row) return false;
  if (input.label !== undefined) {
    await pool.query("UPDATE attachments SET label = ? WHERE id = ?", [
      input.label?.trim().slice(0, 255) || null,
      attachmentId,
    ]);
  }
  if (input.makePrimary) {
    // Iedereen één plek op, deze naar voren.
    await pool.query("UPDATE attachments SET position = position + 1 WHERE reference_id = ?", [
      row.reference_id,
    ]);
    await pool.query("UPDATE attachments SET position = 0 WHERE id = ?", [attachmentId]);
  }
  return true;
}

export async function deleteAttachment(userId: string, attachmentId: string): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.query<AttRow[]>(
    `SELECT a.storage_path FROM attachments a
     JOIN ref_items r ON r.id = a.reference_id
     WHERE a.id = ? AND r.user_id = ?`,
    [attachmentId, userId],
  );
  if (!rows[0]) return false;
  const [result] = await pool.query<ResultSetHeader>("DELETE FROM attachments WHERE id = ?", [
    attachmentId,
  ]);
  await unlinkStored(rows[0].storage_path);
  return result.affectedRows === 1;
}

export async function deletePdfFilesForReference(
  userId: string,
  referenceId: string,
): Promise<void> {
  const [rows] = await getPool().query<AttRow[]>(
    `SELECT a.storage_path FROM attachments a
     JOIN ref_items r ON r.id = a.reference_id
     WHERE a.reference_id = ? AND r.user_id = ?`,
    [referenceId, userId],
  );
  for (const row of rows) await unlinkStored(row.storage_path);
}
