import { randomUUID } from "crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool, withTransaction } from "@/lib/db/mysql";
import { smartRulesToSql, type SmartRules } from "./smart";
import { loadTagsFor, setReferenceTags } from "./tags";
import type { AuthorInput, ReferenceCounts, ReferenceInput, ReferenceRecord } from "./types";

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
  deleted_at: Date | null;
  label: number | null;
  created_at: Date;
  updated_at: Date;
  has_pdf: number;
  attachment_id: string | null;
  attachment_count: number | null;
};

type AuthorRow = RowDataPacket & {
  given_name: string;
  family_name: string;
  position: number;
};

/** Pool of transactieverbinding: beide hebben `query`. */
type Db = Pick<PoolConnection, "query">;

type Extras = { tags: string[]; groupIds: string[] };

function mapRow(row: RefRow, authors: AuthorRow[], extras: Extras): ReferenceRecord {
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
    deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
    label: row.label ?? null,
    tags: extras.tags,
    groupIds: extras.groupIds,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    hasPdf: Boolean(row.has_pdf),
    attachmentId: row.attachment_id ?? null,
    attachmentCount: Number(row.attachment_count ?? 0),
    authors: authors
      .sort((a, b) => a.position - b.position)
      .map((a) => ({
        givenName: a.given_name,
        familyName: a.family_name,
      })),
  };
}

/** Auteurs van meerdere referenties in één query, gegroepeerd per referentie-id. */
async function loadAuthorsFor(
  referenceIds: string[],
): Promise<Map<string, AuthorRow[]>> {
  const byRef = new Map<string, AuthorRow[]>();
  if (referenceIds.length === 0) return byRef;
  const [rows] = await getPool().query<(AuthorRow & { reference_id: string })[]>(
    `SELECT ra.reference_id, a.given_name, a.family_name, ra.position
     FROM reference_authors ra
     JOIN authors a ON a.id = ra.author_id
     WHERE ra.reference_id IN (?)
     ORDER BY ra.reference_id, ra.position`,
    [referenceIds],
  );
  for (const row of rows) {
    const list = byRef.get(row.reference_id);
    if (list) list.push(row);
    else byRef.set(row.reference_id, [row]);
  }
  return byRef;
}

/** Handmatige groepen per referentie-id. */
async function loadGroupIdsFor(referenceIds: string[]): Promise<Map<string, string[]>> {
  const byRef = new Map<string, string[]>();
  if (referenceIds.length === 0) return byRef;
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT reference_id, group_id FROM group_items WHERE reference_id IN (?)",
    [referenceIds],
  );
  for (const row of rows) {
    const list = byRef.get(row.reference_id as string);
    if (list) list.push(row.group_id as string);
    else byRef.set(row.reference_id as string, [row.group_id as string]);
  }
  return byRef;
}

/** Rijen omzetten met auteurs, trefwoorden en groepen, elk in één query. */
async function mapRows(rows: RefRow[]): Promise<ReferenceRecord[]> {
  const ids = rows.map((row) => row.id);
  const [authors, tags, groups] = await Promise.all([
    loadAuthorsFor(ids),
    loadTagsFor(ids),
    loadGroupIdsFor(ids),
  ]);
  return rows.map((row) =>
    mapRow(row, authors.get(row.id) ?? [], {
      tags: tags.get(row.id) ?? [],
      groupIds: groups.get(row.id) ?? [],
    }),
  );
}

/** Referentie met de hoofd-PDF (eerste op volgorde) en het aantal bijlagen. */
const REF_SELECT = `SELECT r.*,
      att.attachment_id IS NOT NULL AS has_pdf,
      att.attachment_id,
      att.attachment_count
     FROM ref_items r
     LEFT JOIN (
       SELECT reference_id,
         SUBSTRING_INDEX(GROUP_CONCAT(id ORDER BY position, created_at), ',', 1) AS attachment_id,
         COUNT(*) AS attachment_count
       FROM attachments
       GROUP BY reference_id
     ) att ON att.reference_id = r.id`;

function cleanAuthor(a: AuthorInput): { givenName: string; familyName: string } {
  return {
    givenName: (a.givenName ?? "").trim().slice(0, 255),
    familyName: (a.familyName ?? "").trim().slice(0, 255),
  };
}

/** Zelfde sleutel als de kolom authors.name_key (zie sql/migrations/002). */
function nameKey(a: { givenName: string; familyName: string }): string {
  return `${a.givenName}|${a.familyName}`;
}

/**
 * Koppelt auteurs aan een referentie. Bestaande auteurs (exact dezelfde naam) worden
 * hergebruikt; auteurs die daarna nergens meer aan hangen worden opgeruimd.
 */
async function setReferenceAuthors(
  db: Db,
  referenceId: string,
  input: AuthorInput[],
): Promise<void> {
  const [previous] = await db.query<RowDataPacket[]>(
    "SELECT author_id FROM reference_authors WHERE reference_id = ?",
    [referenceId],
  );
  await db.query("DELETE FROM reference_authors WHERE reference_id = ?", [referenceId]);

  const authors = input.map(cleanAuthor).filter((a) => a.givenName || a.familyName);
  if (authors.length > 0) {
    const unique = [...new Map(authors.map((a) => [nameKey(a), a])).values()];
    await db.query(
      "INSERT IGNORE INTO authors (id, given_name, family_name) VALUES ?",
      [unique.map((a) => [randomUUID(), a.givenName, a.familyName])],
    );
    const [rows] = await db.query<RowDataPacket[]>(
      "SELECT id, name_key FROM authors WHERE name_key IN (?)",
      [unique.map(nameKey)],
    );
    const idByKey = new Map(rows.map((row) => [row.name_key as string, row.id as string]));
    await db.query(
      "INSERT INTO reference_authors (reference_id, author_id, position) VALUES ?",
      [authors.map((a, i) => [referenceId, idByKey.get(nameKey(a)), i])],
    );
  }

  await deleteOrphanAuthors(
    db,
    previous.map((row) => row.author_id as string),
  );
}

/** Verwijdert auteurs zonder referentie; met `ids` alleen binnen die set. */
async function deleteOrphanAuthors(db: Db, ids?: string[]): Promise<void> {
  if (ids && ids.length === 0) return;
  await db.query(
    `DELETE a FROM authors a
     LEFT JOIN reference_authors ra ON ra.author_id = a.id
     WHERE ra.author_id IS NULL${ids ? " AND a.id IN (?)" : ""}`,
    ids ? [ids] : [],
  );
}

export type ListFilters = {
  q?: string;
  status?: string;
  starred?: boolean;
  hasPdf?: boolean;
  /** Alleen de prullenbak tonen in plaats van de gewone bibliotheek. */
  trash?: boolean;
  /** Waarin gezocht wordt; standaard overal. */
  field?: SearchField;
  /** Alleen artikelen uit deze handmatige groep. */
  groupId?: string;
  /** Regels van een slimme groep. */
  smart?: SmartRules;
  tagId?: string;
  label?: number;
  /** Alleen deze id's (bijv. dubbelen). */
  ids?: string[];
};

export const SEARCH_FIELDS = ["all", "title", "author", "journal", "doi", "fulltext"] as const;
export type SearchField = (typeof SEARCH_FIELDS)[number];

const AUTHOR_MATCH = `EXISTS (
  SELECT 1 FROM reference_authors ra
  JOIN authors a ON a.id = ra.author_id
  WHERE ra.reference_id = r.id
    AND (a.family_name LIKE ? OR CONCAT(a.given_name, ' ', a.family_name) LIKE ?)
)`;

/** Zoekt in de geëxtraheerde tekst van de PDF's (FULLTEXT-index op attachments). */
const FULLTEXT_MATCH = `EXISTS (
  SELECT 1 FROM attachments x
  WHERE x.reference_id = r.id AND MATCH(x.fulltext) AGAINST (? IN NATURAL LANGUAGE MODE)
)`;

export async function listReferences(
  userId: string,
  filters: ListFilters = {},
): Promise<ReferenceRecord[]> {
  const where: string[] = [
    "r.user_id = ?",
    filters.trash ? "r.deleted_at IS NOT NULL" : "r.deleted_at IS NULL",
  ];
  const params: unknown[] = [userId];

  if (filters.status && filters.status !== "all") {
    where.push("r.status = ?");
    params.push(filters.status);
  }
  if (filters.starred) {
    where.push("r.starred = 1");
  }
  if (filters.hasPdf) {
    where.push("att.attachment_id IS NOT NULL");
  }
  if (filters.groupId) {
    where.push("EXISTS (SELECT 1 FROM group_items gi WHERE gi.group_id = ? AND gi.reference_id = r.id)");
    params.push(filters.groupId);
  }
  if (filters.smart) {
    const smart = smartRulesToSql(filters.smart);
    where.push(smart.sql);
    params.push(...smart.params);
  }
  if (filters.tagId) {
    where.push("EXISTS (SELECT 1 FROM reference_tags rt WHERE rt.tag_id = ? AND rt.reference_id = r.id)");
    params.push(filters.tagId);
  }
  if (filters.label) {
    where.push("r.label = ?");
    params.push(filters.label);
  }
  if (filters.ids) {
    if (filters.ids.length === 0) return [];
    where.push("r.id IN (?)");
    params.push(filters.ids);
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    const like = `%${escapeLike(q)}%`;
    switch (filters.field ?? "all") {
      case "title":
        where.push("r.title LIKE ?");
        params.push(like);
        break;
      case "author":
        where.push(AUTHOR_MATCH);
        params.push(like, like);
        break;
      case "journal":
        where.push("r.journal LIKE ?");
        params.push(like);
        break;
      case "doi":
        where.push("r.doi LIKE ?");
        params.push(like);
        break;
      case "fulltext":
        where.push(FULLTEXT_MATCH);
        params.push(q);
        break;
      default:
        where.push(
          `(MATCH(r.title, r.abstract, r.journal) AGAINST (? IN NATURAL LANGUAGE MODE)
            OR r.title LIKE ? OR r.doi LIKE ? OR ${AUTHOR_MATCH} OR ${FULLTEXT_MATCH})`,
        );
        params.push(q, like, like, like, like, q);
    }
  }

  const [rows] = await getPool().query<RefRow[]>(
    `${REF_SELECT}
     WHERE ${where.join(" AND ")}
     ORDER BY ${filters.trash ? "r.deleted_at" : "r.updated_at"} DESC
     LIMIT 500`,
    params,
  );

  return mapRows(rows);
}

/** Aantal (niet-verwijderde) artikelen dat aan slimme regels voldoet. */
export async function countSmart(userId: string, rules: SmartRules): Promise<number> {
  const smart = smartRulesToSql(rules);
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM ref_items r WHERE r.user_id = ? AND r.deleted_at IS NULL AND ${smart.sql}`,
    [userId, ...smart.params],
  );
  return Number(rows[0]?.n ?? 0);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/** Aantallen voor de zijbalk, in één query. */
export async function countReferences(userId: string): Promise<ReferenceCounts> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT
       SUM(r.deleted_at IS NULL) AS all_count,
       SUM(r.deleted_at IS NULL AND r.status = 'unread') AS unread,
       SUM(r.deleted_at IS NULL AND r.status = 'reading') AS reading,
       SUM(r.deleted_at IS NULL AND r.status = 'read') AS read_count,
       SUM(r.deleted_at IS NULL AND r.starred = 1) AS starred,
       SUM(r.deleted_at IS NULL AND EXISTS (
         SELECT 1 FROM attachments att WHERE att.reference_id = r.id
       )) AS has_pdf,
       SUM(r.deleted_at IS NOT NULL) AS trash
     FROM ref_items r
     WHERE r.user_id = ?`,
    [userId],
  );
  const row = rows[0] ?? {};
  const n = (value: unknown) => Number(value ?? 0);
  return {
    all: n(row.all_count),
    unread: n(row.unread),
    reading: n(row.reading),
    read: n(row.read_count),
    starred: n(row.starred),
    hasPdf: n(row.has_pdf),
    trash: n(row.trash),
    duplicates: 0,
  };
}

/** Ook referenties in de prullenbak; `deletedAt` zegt of dat zo is. */
export async function getReference(
  userId: string,
  id: string,
): Promise<ReferenceRecord | null> {
  const [rows] = await getPool().query<RefRow[]>(
    `${REF_SELECT}
     WHERE r.id = ? AND r.user_id = ?
     LIMIT 1`,
    [id, userId],
  );
  const row = rows[0];
  if (!row) return null;
  return (await mapRows([row]))[0];
}

/** Zoekt op DOI, ook in de prullenbak (zodat een nieuwe import die kan terugzetten). */
export async function getReferenceByDoi(
  userId: string,
  doi: string,
): Promise<ReferenceRecord | null> {
  const normalized = doi.trim().toLowerCase();
  const [rows] = await getPool().query<RefRow[]>(
    `${REF_SELECT}
     WHERE r.user_id = ? AND LOWER(r.doi) = ?
     ORDER BY r.deleted_at IS NOT NULL, r.updated_at DESC
     LIMIT 1`,
    [userId, normalized],
  );
  const row = rows[0];
  if (!row) return null;
  return (await mapRows([row]))[0];
}

/** DOI (lowercase) → referentie-id, voor kruisverwijzingen die al in de bibliotheek staan. */
export async function findReferenceIdsByDois(
  userId: string,
  dois: string[],
): Promise<Map<string, string>> {
  const normalized = [...new Set(dois.map((doi) => doi.trim().toLowerCase()).filter(Boolean))];
  if (normalized.length === 0) return new Map();

  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT id, doi FROM ref_items
     WHERE user_id = ? AND deleted_at IS NULL AND doi IS NOT NULL AND LOWER(doi) IN (?)`,
    [userId, normalized],
  );
  const matches = new Map<string, string>();
  for (const row of rows) {
    if (typeof row.doi === "string" && typeof row.id === "string") {
      matches.set(row.doi.toLowerCase(), row.id);
    }
  }
  return matches;
}

export async function createReference(
  userId: string,
  input: ReferenceInput,
): Promise<ReferenceRecord> {
  const id = randomUUID();
  await withTransaction(async (conn) => {
    await conn.query(
      `INSERT INTO ref_items (
        id, user_id, type, title, abstract, year, journal, volume, issue, pages,
        doi, url, pmid, cite_key, status, starred, label
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        input.label ?? null,
      ],
    );
    if (input.authors?.length) await setReferenceAuthors(conn, id, input.authors);
    if (input.tags?.length) await setReferenceTags(conn, userId, id, input.tags);
  });
  const ref = await getReference(userId, id);
  if (!ref) throw new Error("Reference not found after insert");
  return ref;
}

/** Tekstvelden die met `null` of een lege string gewist kunnen worden. */
const NULLABLE_TEXT = {
  abstract: "abstract",
  journal: "journal",
  volume: "volume",
  issue: "issue",
  pages: "pages",
  doi: "doi",
  url: "url",
  pmid: "pmid",
  citeKey: "cite_key",
} as const;

/**
 * Werkt alleen de meegegeven velden bij. `undefined` laat een veld staan;
 * `null` wist het (behalve titel, type, status en favoriet).
 */
export async function updateReference(
  userId: string,
  id: string,
  input: Partial<ReferenceInput>,
): Promise<ReferenceRecord | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const set = (column: string, value: unknown) => {
    sets.push(`${column} = ?`);
    params.push(value);
  };

  if (input.type) set("type", input.type);
  if (input.title?.trim()) set("title", input.title.trim());
  if (input.status) set("status", input.status);
  if (input.starred !== undefined && input.starred !== null) set("starred", input.starred ? 1 : 0);
  if (input.year !== undefined) set("year", input.year);
  if (input.label !== undefined) set("label", input.label);
  for (const [key, column] of Object.entries(NULLABLE_TEXT) as [
    keyof typeof NULLABLE_TEXT,
    string,
  ][]) {
    const value = input[key];
    if (value !== undefined) set(column, value?.trim() || null);
  }

  const found = await withTransaction(async (conn) => {
    const [owned] = await conn.query<RowDataPacket[]>(
      "SELECT id FROM ref_items WHERE id = ? AND user_id = ? FOR UPDATE",
      [id, userId],
    );
    if (!owned[0]) return false;
    if (sets.length > 0) {
      await conn.query(`UPDATE ref_items SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, [
        ...params,
        id,
        userId,
      ]);
    }
    if (input.authors) await setReferenceAuthors(conn, id, input.authors);
    if (input.tags) await setReferenceTags(conn, userId, id, input.tags);
    return true;
  });
  return found ? getReference(userId, id) : null;
}

/** Naar de prullenbak. */
export async function trashReference(userId: string, id: string): Promise<boolean> {
  const [result] = await getPool().query<ResultSetHeader>(
    "UPDATE ref_items SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
    [id, userId],
  );
  return result.affectedRows === 1;
}

/** Uit de prullenbak terugzetten. */
export async function restoreReference(userId: string, id: string): Promise<boolean> {
  const [result] = await getPool().query<ResultSetHeader>(
    "UPDATE ref_items SET deleted_at = NULL WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL",
    [id, userId],
  );
  return result.affectedRows === 1;
}

/**
 * Definitief verwijderen uit de database (notities, bijlagerijen en highlights gaan mee via
 * CASCADE). PDF-bestanden op schijf ruimt de aanroeper op, vóór deze aanroep.
 */
export async function deleteReference(userId: string, id: string): Promise<boolean> {
  return withTransaction(async (conn) => {
    const [authors] = await conn.query<RowDataPacket[]>(
      `SELECT ra.author_id FROM reference_authors ra
       JOIN ref_items r ON r.id = ra.reference_id
       WHERE r.id = ? AND r.user_id = ?`,
      [id, userId],
    );
    const [result] = await conn.query<ResultSetHeader>(
      "DELETE FROM ref_items WHERE id = ? AND user_id = ?",
      [id, userId],
    );
    await deleteOrphanAuthors(
      conn,
      authors.map((row) => row.author_id as string),
    );
    return result.affectedRows === 1;
  });
}

/** Id's van alles in de prullenbak van deze gebruiker. */
export async function listTrashedIds(userId: string): Promise<string[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT id FROM ref_items WHERE user_id = ? AND deleted_at IS NOT NULL",
    [userId],
  );
  return rows.map((row) => row.id as string);
}
