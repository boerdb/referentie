import { randomUUID } from "crypto";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db/mysql";
import type { AuthorInput, ReferenceInput, ReferenceRecord } from "./types";

type RefRow = RowDataPacket & {
  id: string;
  user_id: string;
  type: string;
  title: string;
  abstract: string | null;
  year: number | null;
  journal: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  doi: string | null;
  url: string | null;
  pmid: string | null;
  cite_key: string | null;
  status: "unread" | "reading" | "read";
  starred: number;
  created_at: Date;
  updated_at: Date;
  has_pdf: number;
  attachment_id: string | null;
};

type AuthorRow = RowDataPacket & {
  given_name: string;
  family_name: string;
  position: number;
};

function mapRow(row: RefRow, authors: AuthorRow[]): ReferenceRecord {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    abstract: row.abstract,
    year: row.year,
    journal: row.journal,
    volume: row.volume,
    issue: row.issue,
    pages: row.pages,
    doi: row.doi,
    url: row.url,
    pmid: row.pmid,
    citeKey: row.cite_key,
    status: row.status,
    starred: Boolean(row.starred),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    hasPdf: Boolean(row.has_pdf),
    attachmentId: row.attachment_id ?? null,
    authors: authors
      .sort((a, b) => a.position - b.position)
      .map((a) => ({
        givenName: a.given_name,
        familyName: a.family_name,
      })),
  };
}

async function loadAuthors(referenceId: string): Promise<AuthorRow[]> {
  const pool = getPool();
  const [rows] = await pool.query<AuthorRow[]>(
    `SELECT a.given_name, a.family_name, ra.position
     FROM reference_authors ra
     JOIN authors a ON a.id = ra.author_id
     WHERE ra.reference_id = ?
     ORDER BY ra.position`,
    [referenceId],
  );
  return rows;
}

async function upsertAuthors(
  referenceId: string,
  authors: AuthorInput[] | undefined,
): Promise<void> {
  const pool = getPool();
  await pool.query("DELETE FROM reference_authors WHERE reference_id = ?", [
    referenceId,
  ]);
  if (!authors?.length) return;

  for (let i = 0; i < authors.length; i++) {
    const a = authors[i];
    const authorId = randomUUID();
    await pool.query(
      "INSERT INTO authors (id, given_name, family_name) VALUES (?, ?, ?)",
      [authorId, a.givenName?.trim() ?? "", a.familyName?.trim() ?? ""],
    );
    await pool.query(
      "INSERT INTO reference_authors (reference_id, author_id, position) VALUES (?, ?, ?)",
      [referenceId, authorId, i],
    );
  }
}

export type ListFilters = {
  q?: string;
  status?: string;
  starred?: boolean;
  hasPdf?: boolean;
};

export async function listReferences(
  userId: string,
  filters: ListFilters = {},
): Promise<ReferenceRecord[]> {
  const pool = getPool();
  const where: string[] = ["r.user_id = ?"];
  const params: unknown[] = [userId];

  if (filters.status && filters.status !== "all") {
    where.push("r.status = ?");
    params.push(filters.status);
  }
  if (filters.starred) {
    where.push("r.starred = 1");
  }
  if (filters.hasPdf) {
    where.push("EXISTS (SELECT 1 FROM attachments att WHERE att.reference_id = r.id)");
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.push(
      "(MATCH(r.title, r.abstract, r.journal) AGAINST (? IN NATURAL LANGUAGE MODE) OR r.title LIKE ? OR r.doi LIKE ?)",
    );
    params.push(q, `%${q}%`, `%${q}%`);
  }

  const [rows] = await pool.query<RefRow[]>(
    `SELECT r.*,
      EXISTS (SELECT 1 FROM attachments att WHERE att.reference_id = r.id) AS has_pdf,
      (SELECT att.id FROM attachments att WHERE att.reference_id = r.id LIMIT 1) AS attachment_id
     FROM ref_items r
     WHERE ${where.join(" AND ")}
     ORDER BY r.updated_at DESC
     LIMIT 500`,
    params,
  );

  const out: ReferenceRecord[] = [];
  for (const row of rows) {
    const authors = await loadAuthors(row.id);
    out.push(mapRow(row, authors));
  }
  return out;
}

export async function getReference(
  userId: string,
  id: string,
): Promise<ReferenceRecord | null> {
  const pool = getPool();
  const [rows] = await pool.query<RefRow[]>(
    `SELECT r.*,
      EXISTS (SELECT 1 FROM attachments att WHERE att.reference_id = r.id) AS has_pdf,
      (SELECT att.id FROM attachments att WHERE att.reference_id = r.id LIMIT 1) AS attachment_id
     FROM ref_items r
     WHERE r.id = ? AND r.user_id = ?
     LIMIT 1`,
    [id, userId],
  );
  const row = rows[0];
  if (!row) return null;
  const authors = await loadAuthors(row.id);
  return mapRow(row, authors);
}

export async function getReferenceByDoi(
  userId: string,
  doi: string,
): Promise<ReferenceRecord | null> {
  const pool = getPool();
  const normalized = doi.trim().toLowerCase();
  const [rows] = await pool.query<RefRow[]>(
    `SELECT r.*,
      EXISTS (SELECT 1 FROM attachments att WHERE att.reference_id = r.id) AS has_pdf,
      (SELECT att.id FROM attachments att WHERE att.reference_id = r.id LIMIT 1) AS attachment_id
     FROM ref_items r
     WHERE r.user_id = ? AND LOWER(r.doi) = ?
     LIMIT 1`,
    [userId, normalized],
  );
  const row = rows[0];
  if (!row) return null;
  const authors = await loadAuthors(row.id);
  return mapRow(row, authors);
}

export async function createReference(
  userId: string,
  input: ReferenceInput,
): Promise<ReferenceRecord> {
  const pool = getPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO ref_items (
      id, user_id, type, title, abstract, year, journal, volume, issue, pages,
      doi, url, pmid, cite_key, status, starred
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      input.type ?? "article",
      input.title.trim(),
      input.abstract?.trim() || null,
      input.year ?? null,
      input.journal?.trim() || null,
      input.volume?.trim() || null,
      input.issue?.trim() || null,
      input.pages?.trim() || null,
      input.doi?.trim() || null,
      input.url?.trim() || null,
      input.pmid?.trim() || null,
      input.citeKey?.trim() || null,
      input.status ?? "unread",
      input.starred ? 1 : 0,
    ],
  );
  await upsertAuthors(id, input.authors);
  const ref = await getReference(userId, id);
  if (!ref) throw new Error("Reference not found after insert");
  return ref;
}

export async function updateReference(
  userId: string,
  id: string,
  input: Partial<ReferenceInput>,
): Promise<ReferenceRecord | null> {
  const existing = await getReference(userId, id);
  if (!existing) return null;

  const pool = getPool();
  await pool.query(
    `UPDATE ref_items SET
      type = COALESCE(?, type),
      title = COALESCE(?, title),
      abstract = ?,
      year = ?,
      journal = ?,
      volume = ?,
      issue = ?,
      pages = ?,
      doi = ?,
      url = ?,
      pmid = ?,
      cite_key = ?,
      status = COALESCE(?, status),
      starred = COALESCE(?, starred)
     WHERE id = ? AND user_id = ?`,
    [
      input.type ?? null,
      input.title?.trim() ?? null,
      input.abstract !== undefined ? input.abstract?.trim() || null : existing.abstract,
      input.year !== undefined ? input.year : existing.year,
      input.journal !== undefined ? input.journal?.trim() || null : existing.journal,
      input.volume !== undefined ? input.volume?.trim() || null : existing.volume,
      input.issue !== undefined ? input.issue?.trim() || null : existing.issue,
      input.pages !== undefined ? input.pages?.trim() || null : existing.pages,
      input.doi !== undefined ? input.doi?.trim() || null : existing.doi,
      input.url !== undefined ? input.url?.trim() || null : existing.url,
      input.pmid !== undefined ? input.pmid?.trim() || null : existing.pmid,
      input.citeKey !== undefined ? input.citeKey?.trim() || null : existing.citeKey,
      input.status ?? null,
      input.starred !== undefined ? (input.starred ? 1 : 0) : null,
      id,
      userId,
    ],
  );
  if (input.authors) {
    await upsertAuthors(id, input.authors);
  }
  return getReference(userId, id);
}

export async function deleteReference(
  userId: string,
  id: string,
): Promise<boolean> {
  const pool = getPool();
  const [result] = await pool.query(
    "DELETE FROM ref_items WHERE id = ? AND user_id = ?",
    [id, userId],
  );
  return (result as { affectedRows?: number }).affectedRows === 1;
}
