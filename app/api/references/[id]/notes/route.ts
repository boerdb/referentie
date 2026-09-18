import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db/mysql";
import { getReference } from "@/lib/references/queries";
import { jsonError, jsonOk, requireSession } from "@/lib/api/http";

type Ctx = { params: Promise<{ id: string }> };

type NoteRow = RowDataPacket & {
  id: string;
  body: string;
  updated_at: Date;
};

export async function GET(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;

  const ref = await getReference(session.userId, id);
  if (!ref) return jsonError("Niet gevonden.", 404);

  const pool = getPool();
  const [rows] = await pool.query<NoteRow[]>(
    "SELECT id, body, updated_at FROM notes WHERE reference_id = ? LIMIT 1",
    [id],
  );
  const note = rows[0];
  return jsonOk({
    note: note
      ? { id: note.id, body: note.body, updatedAt: note.updated_at.toISOString() }
      : null,
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;

  const ref = await getReference(session.userId, id);
  if (!ref) return jsonError("Niet gevonden.", 404);

  const body = (await req.json()) as { body?: string };
  const text = body.body ?? "";

  const pool = getPool();
  const [existing] = await pool.query<NoteRow[]>(
    "SELECT id FROM notes WHERE reference_id = ? LIMIT 1",
    [id],
  );

  if (existing[0]) {
    await pool.query("UPDATE notes SET body = ? WHERE reference_id = ?", [
      text,
      id,
    ]);
  } else {
    await pool.query(
      "INSERT INTO notes (id, reference_id, body) VALUES (?, ?, ?)",
      [randomUUID(), id, text],
    );
  }

  return jsonOk({ ok: true });
}
