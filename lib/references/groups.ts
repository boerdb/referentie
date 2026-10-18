import { randomUUID } from "crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db/mysql";
import { countSmart } from "./queries";
import type { SmartRules } from "./smart";
import type { GroupKind, GroupRecord } from "./types";

type GroupRow = RowDataPacket & {
  id: string;
  parent_id: string | null;
  name: string;
  kind: GroupKind;
  rules: string | SmartRules | null;
  position: number;
  n: number | null;
};

function parseRules(raw: GroupRow["rules"]): SmartRules | null {
  if (!raw) return null;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as SmartRules;
  } catch {
    return null;
  }
}

/** Alle groepen met aantallen; slimme groepen worden per groep geteld. */
export async function listGroups(userId: string): Promise<GroupRecord[]> {
  const [rows] = await getPool().query<GroupRow[]>(
    `SELECT g.id, g.parent_id, g.name, g.kind, g.rules, g.position, COUNT(r.id) AS n
     FROM ref_groups g
     LEFT JOIN group_items gi ON gi.group_id = g.id
     LEFT JOIN ref_items r ON r.id = gi.reference_id AND r.deleted_at IS NULL
     WHERE g.user_id = ?
     GROUP BY g.id, g.parent_id, g.name, g.kind, g.rules, g.position
     ORDER BY g.kind, g.position, g.name`,
    [userId],
  );
  return Promise.all(
    rows.map(async (row) => {
      const rules = parseRules(row.rules);
      return {
        id: row.id,
        parentId: row.parent_id,
        name: row.name,
        kind: row.kind,
        rules,
        position: row.position,
        count: row.kind === "smart" && rules ? await countSmart(userId, rules) : Number(row.n ?? 0),
      };
    }),
  );
}

export async function getGroup(userId: string, id: string): Promise<GroupRecord | null> {
  const groups = await listGroups(userId);
  return groups.find((g) => g.id === id) ?? null;
}

export async function createGroup(
  userId: string,
  input: { name: string; kind: GroupKind; parentId?: string | null; rules?: SmartRules | null },
): Promise<string> {
  const id = randomUUID();
  const [pos] = await getPool().query<RowDataPacket[]>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM ref_groups WHERE user_id = ? AND kind = ?",
    [userId, input.kind],
  );
  await getPool().query(
    "INSERT INTO ref_groups (id, user_id, parent_id, name, kind, rules, position) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      userId,
      input.kind === "manual" ? (input.parentId ?? null) : null,
      input.name,
      input.kind,
      input.kind === "smart" ? JSON.stringify(input.rules) : null,
      Number(pos[0]?.p ?? 0),
    ],
  );
  return id;
}

export async function updateGroup(
  userId: string,
  id: string,
  input: { name?: string; parentId?: string | null; rules?: SmartRules },
): Promise<boolean> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.name !== undefined) {
    sets.push("name = ?");
    params.push(input.name);
  }
  if (input.parentId !== undefined) {
    sets.push("parent_id = ?");
    params.push(input.parentId);
  }
  if (input.rules !== undefined) {
    sets.push("rules = ?");
    params.push(JSON.stringify(input.rules));
  }
  if (sets.length === 0) return true;
  const [result] = await getPool().query<ResultSetHeader>(
    `UPDATE ref_groups SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`,
    [...params, id, userId],
  );
  return result.affectedRows === 1;
}

/** Verwijdert de groep (en subgroepen); de artikelen zelf blijven staan. */
export async function deleteGroup(userId: string, id: string): Promise<boolean> {
  const [result] = await getPool().query<ResultSetHeader>(
    "DELETE FROM ref_groups WHERE id = ? AND user_id = ?",
    [id, userId],
  );
  return result.affectedRows === 1;
}

/** Artikelen toevoegen aan of weghalen uit een handmatige groep. Alleen eigen artikelen. */
export async function setGroupMembership(
  userId: string,
  groupId: string,
  referenceIds: string[],
  remove = false,
): Promise<number | null> {
  const [group] = await getPool().query<RowDataPacket[]>(
    "SELECT id FROM ref_groups WHERE id = ? AND user_id = ? AND kind = ?",
    [groupId, userId, "manual"],
  );
  if (!group[0]) return null;
  if (referenceIds.length === 0) return 0;
  if (remove) {
    const [result] = await getPool().query<ResultSetHeader>(
      "DELETE FROM group_items WHERE group_id = ? AND reference_id IN (?)",
      [groupId, referenceIds],
    );
    return result.affectedRows;
  }
  const [owned] = await getPool().query<RowDataPacket[]>(
    "SELECT id FROM ref_items WHERE user_id = ? AND id IN (?)",
    [userId, referenceIds],
  );
  if (owned.length === 0) return 0;
  const [result] = await getPool().query<ResultSetHeader>(
    "INSERT IGNORE INTO group_items (group_id, reference_id) VALUES ?",
    [owned.map((row) => [groupId, row.id])],
  );
  return result.affectedRows;
}

/** Controleert dat een (nieuwe) bovenliggende groep van de gebruiker is en geen lus maakt. */
export async function isValidParent(
  userId: string,
  groupId: string | null,
  parentId: string,
): Promise<boolean> {
  const groups = await listGroups(userId);
  const byId = new Map(groups.map((g) => [g.id, g]));
  let current = byId.get(parentId);
  if (!current || current.kind !== "manual") return false;
  while (current) {
    if (current.id === groupId) return false;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return true;
}
