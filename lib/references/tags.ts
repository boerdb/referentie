import { randomUUID } from "crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool, withTransaction } from "@/lib/db/mysql";
import type { TagRecord } from "./types";

type Db = Pick<PoolConnection, "query">;

/** Trefwoorden per referentie-id, alfabetisch. */
export async function loadTagsFor(referenceIds: string[]): Promise<Map<string, string[]>> {
  const byRef = new Map<string, string[]>();
  if (referenceIds.length === 0) return byRef;
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT rt.reference_id, t.name FROM reference_tags rt
     JOIN tags t ON t.id = rt.tag_id
     WHERE rt.reference_id IN (?)
     ORDER BY t.name`,
    [referenceIds],
  );
  for (const row of rows) {
    const list = byRef.get(row.reference_id as string);
    if (list) list.push(row.name as string);
    else byRef.set(row.reference_id as string, [row.name as string]);
  }
  return byRef;
}

/** Id's van trefwoorden op naam; ontbrekende worden aangemaakt (naam is hoofdletterongevoelig uniek). */
async function ensureTags(db: Db, userId: string, names: string[]): Promise<string[]> {
  if (names.length === 0) return [];
  await db.query("INSERT IGNORE INTO tags (id, user_id, name) VALUES ?", [
    names.map((name) => [randomUUID(), userId, name]),
  ]);
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT id FROM tags WHERE user_id = ? AND name IN (?)",
    [userId, names],
  );
  return rows.map((row) => row.id as string);
}

/** Vervangt de trefwoorden van één referentie. */
export async function setReferenceTags(
  db: Db,
  userId: string,
  referenceId: string,
  names: string[],
): Promise<void> {
  await db.query("DELETE FROM reference_tags WHERE reference_id = ?", [referenceId]);
  const ids = await ensureTags(db, userId, names);
  if (ids.length > 0) {
    await db.query("INSERT IGNORE INTO reference_tags (reference_id, tag_id) VALUES ?", [
      ids.map((id) => [referenceId, id]),
    ]);
  }
}

/** Trefwoord toevoegen aan of weghalen bij meerdere (eigen) referenties. */
export async function tagReferences(
  userId: string,
  referenceIds: string[],
  name: string,
  remove = false,
): Promise<number> {
  return withTransaction(async (conn) => {
    const [owned] = await conn.query<RowDataPacket[]>(
      "SELECT id FROM ref_items WHERE user_id = ? AND id IN (?)",
      [userId, referenceIds],
    );
    const ids = owned.map((row) => row.id as string);
    if (ids.length === 0) return 0;
    if (remove) {
      const [result] = await conn.query<ResultSetHeader>(
        `DELETE rt FROM reference_tags rt JOIN tags t ON t.id = rt.tag_id
         WHERE t.user_id = ? AND t.name = ? AND rt.reference_id IN (?)`,
        [userId, name, ids],
      );
      return result.affectedRows;
    }
    const [tagId] = await ensureTags(conn, userId, [name]);
    await conn.query("INSERT IGNORE INTO reference_tags (reference_id, tag_id) VALUES ?", [
      ids.map((id) => [id, tagId]),
    ]);
    return ids.length;
  });
}

/** Alle trefwoorden met het aantal (niet-verwijderde) artikelen. */
export async function listTags(userId: string): Promise<TagRecord[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT t.id, t.name, COUNT(r.id) AS n
     FROM tags t
     LEFT JOIN reference_tags rt ON rt.tag_id = t.id
     LEFT JOIN ref_items r ON r.id = rt.reference_id AND r.deleted_at IS NULL
     WHERE t.user_id = ?
     GROUP BY t.id, t.name
     ORDER BY t.name`,
    [userId],
  );
  return rows.map((row) => ({ id: row.id, name: row.name, count: Number(row.n) }));
}

export async function renameTag(userId: string, id: string, name: string): Promise<boolean> {
  const [result] = await getPool().query<ResultSetHeader>(
    "UPDATE tags SET name = ? WHERE id = ? AND user_id = ?",
    [name, id, userId],
  );
  return result.affectedRows === 1;
}

export async function deleteTag(userId: string, id: string): Promise<boolean> {
  const [result] = await getPool().query<ResultSetHeader>(
    "DELETE FROM tags WHERE id = ? AND user_id = ?",
    [id, userId],
  );
  return result.affectedRows === 1;
}
