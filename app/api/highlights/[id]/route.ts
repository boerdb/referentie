import type { NextRequest } from "next/server";
import type { ResultSetHeader } from "mysql2";
import { getPool } from "@/lib/db/mysql";
import { jsonError, jsonOk, readJson, requireSession } from "@/lib/api/http";

type Ctx = { params: Promise<{ id: string }> };

const COLORS = ["yellow", "green", "blue", "pink", "orange"];

/** Kleur of notitie van een markering wijzigen. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const body = ((await readJson(req)) ?? {}) as { color?: unknown; note?: unknown };

  const sets: string[] = [];
  const params: unknown[] = [];
  if (typeof body.color === "string" && COLORS.includes(body.color)) {
    sets.push("h.color = ?");
    params.push(body.color);
  }
  if (body.note !== undefined) {
    sets.push("h.note = ?");
    params.push(typeof body.note === "string" ? body.note.slice(0, 5000) : null);
  }
  if (sets.length === 0) return jsonError("Niets om te wijzigen.", 400);

  const [result] = await getPool().query<ResultSetHeader>(
    `UPDATE highlights h
     JOIN attachments a ON a.id = h.attachment_id
     JOIN ref_items r ON r.id = a.reference_id
     SET ${sets.join(", ")}
     WHERE h.id = ? AND r.user_id = ?`,
    [...params, id, session.userId],
  );
  if (result.affectedRows === 0) return jsonError("Markering niet gevonden.", 404);
  return jsonOk({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const [result] = await getPool().query<ResultSetHeader>(
    `DELETE h FROM highlights h
     JOIN attachments a ON a.id = h.attachment_id
     JOIN ref_items r ON r.id = a.reference_id
     WHERE h.id = ? AND r.user_id = ?`,
    [id, session.userId],
  );
  if (result.affectedRows === 0) return jsonError("Markering niet gevonden.", 404);
  return jsonOk({ ok: true });
}
