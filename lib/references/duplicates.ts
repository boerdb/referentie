import type { RowDataPacket } from "mysql2/promise";
import { randomUUID } from "crypto";
import { getPool, withTransaction } from "@/lib/db/mysql";
import { normalizeTitle } from "./normalize-title";

export { normalizeTitle };

function normalizeDoi(doi: string): string {
  return doi
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:\s*/, "");
}

/**
 * Sets van mogelijk dubbele artikelen (niet in de prullenbak): dezelfde DOI, of dezelfde
 * genormaliseerde titel met hetzelfde jaar. Elke set heeft minstens twee id's, oudste eerst.
 */
export async function findDuplicateSets(userId: string): Promise<string[][]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT id, doi, title, year FROM ref_items
     WHERE user_id = ? AND deleted_at IS NULL
     ORDER BY created_at`,
    [userId],
  );

  // Union-find: artikelen die op DOI of op titel+jaar overeenkomen komen in één set.
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  const byKey = new Map<string, string>();
  for (const row of rows) {
    const id = row.id as string;
    parent.set(id, id);
    const keys: string[] = [];
    if (typeof row.doi === "string" && row.doi.trim()) keys.push(`doi:${normalizeDoi(row.doi)}`);
    const title = normalizeTitle(String(row.title ?? ""));
    // Korte titels ("Editorial", "Correction") zijn te algemeen om op te vergelijken.
    if (title.length >= 20) keys.push(`title:${title}:${row.year ?? ""}`);
    for (const key of keys) {
      const other = byKey.get(key);
      if (other) union(other, id);
      else byKey.set(key, id);
    }
  }

  const sets = new Map<string, string[]>();
  for (const row of rows) {
    const id = row.id as string;
    const root = find(id);
    const set = sets.get(root);
    if (set) set.push(id);
    else sets.set(root, [id]);
  }
  return [...sets.values()].filter((set) => set.length > 1);
}

const FILL_TEXT = ["abstract", "journal", "volume", "issue", "pages", "doi", "url", "pmid"];
/** Getallen: NULLIF met '' geeft in strikte modus "Truncated incorrect DECIMAL value". */
const FILL_NUMBERS = ["year", "label"];
const STATUS_RANK = { unread: 0, reading: 1, read: 2 } as const;

/**
 * Voegt `mergeIds` samen in `keepId`: lege velden aanvullen, PDF overnemen als het bewaarde
 * artikel er geen heeft, notities achter elkaar, trefwoorden en groepen samen, favoriet en
 * leesstatus behouden. De samengevoegde artikelen gaan naar de prullenbak (terug te zetten).
 */
export async function mergeReferences(
  userId: string,
  keepId: string,
  mergeIds: string[],
): Promise<boolean> {
  const others = [...new Set(mergeIds)].filter((id) => id !== keepId);
  if (others.length === 0) return false;

  return withTransaction(async (conn) => {
    const [owned] = await conn.query<RowDataPacket[]>(
      `SELECT id, title, status, starred FROM ref_items
       WHERE user_id = ? AND deleted_at IS NULL AND id IN (?) FOR UPDATE`,
      [userId, [keepId, ...others]],
    );
    if (owned.length !== others.length + 1) return false;
    const byId = new Map(owned.map((row) => [row.id as string, row]));
    const keep = byId.get(keepId)!;

    // Lege velden van het bewaarde artikel aanvullen, in volgorde van de samen te voegen artikelen.
    for (const id of others) {
      await conn.query(
        `UPDATE ref_items k JOIN ref_items m ON m.id = ?
         SET ${[
           ...FILL_TEXT.map((c) => `k.${c} = COALESCE(NULLIF(k.${c}, ''), m.${c})`),
           ...FILL_NUMBERS.map((c) => `k.${c} = COALESCE(k.${c}, m.${c})`),
         ].join(", ")}
         WHERE k.id = ?`,
        [id, keepId],
      );
    }

    const starred = owned.some((row) => Number(row.starred) === 1);
    const status = owned
      .map((row) => row.status as keyof typeof STATUS_RANK)
      .reduce((best, s) => (STATUS_RANK[s] > STATUS_RANK[best] ? s : best), keep.status as keyof typeof STATUS_RANK);
    await conn.query("UPDATE ref_items SET starred = ?, status = ? WHERE id = ?", [
      starred ? 1 : 0,
      status,
      keepId,
    ]);

    // Auteurs overnemen als het bewaarde artikel er geen heeft.
    const [keepAuthors] = await conn.query<RowDataPacket[]>(
      "SELECT 1 FROM reference_authors WHERE reference_id = ? LIMIT 1",
      [keepId],
    );
    if (!keepAuthors[0]) {
      for (const id of others) {
        const [rows] = await conn.query<RowDataPacket[]>(
          "SELECT author_id, position FROM reference_authors WHERE reference_id = ? ORDER BY position",
          [id],
        );
        if (rows.length > 0) {
          await conn.query("INSERT INTO reference_authors (reference_id, author_id, position) VALUES ?", [
            rows.map((row) => [keepId, row.author_id, row.position]),
          ]);
          break;
        }
      }
    }

    // PDF: alleen verplaatsen als het bewaarde artikel er nog geen heeft.
    const [keepPdf] = await conn.query<RowDataPacket[]>(
      "SELECT 1 FROM attachments WHERE reference_id = ? LIMIT 1",
      [keepId],
    );
    if (!keepPdf[0]) {
      for (const id of others) {
        const [att] = await conn.query<RowDataPacket[]>(
          "SELECT id FROM attachments WHERE reference_id = ? LIMIT 1",
          [id],
        );
        if (att[0]) {
          await conn.query("UPDATE attachments SET reference_id = ? WHERE id = ?", [keepId, att[0].id]);
          break;
        }
      }
    }

    // Notities achter elkaar, met de titel van het samengevoegde artikel als kopje.
    const [notes] = await conn.query<RowDataPacket[]>(
      "SELECT reference_id, body FROM notes WHERE reference_id IN (?)",
      [[keepId, ...others]],
    );
    const noteBy = new Map(notes.map((row) => [row.reference_id as string, String(row.body ?? "")]));
    const merged = [
      noteBy.get(keepId)?.trim(),
      ...others
        .filter((id) => noteBy.get(id)?.trim())
        .map((id) => `### Uit: ${byId.get(id)?.title}\n\n${noteBy.get(id)!.trim()}`),
    ]
      .filter(Boolean)
      .join("\n\n");
    if (merged && merged !== noteBy.get(keepId)) {
      if (noteBy.has(keepId)) {
        await conn.query("UPDATE notes SET body = ? WHERE reference_id = ?", [merged, keepId]);
      } else {
        await conn.query("INSERT INTO notes (id, reference_id, body) VALUES (?, ?, ?)", [
          randomUUID(),
          keepId,
          merged,
        ]);
      }
    }

    await conn.query(
      "INSERT IGNORE INTO reference_tags (reference_id, tag_id) SELECT ?, tag_id FROM reference_tags WHERE reference_id IN (?)",
      [keepId, others],
    );
    await conn.query(
      "INSERT IGNORE INTO group_items (group_id, reference_id) SELECT group_id, ? FROM group_items WHERE reference_id IN (?)",
      [keepId, others],
    );
    await conn.query(
      "UPDATE ref_items SET deleted_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id IN (?)",
      [userId, others],
    );
    return true;
  });
}
