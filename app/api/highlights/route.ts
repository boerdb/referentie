import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db/mysql";
import { jsonError, jsonOk, requireSession } from "@/lib/api/http";

type HlRow = RowDataPacket & {
  id: string;
  attachment_id: string;
  page: number;
  quote: string | null;
  color: string;
  rects: string;
  note: string | null;
};

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;

  const attachmentId = req.nextUrl.searchParams.get("attachmentId");
  if (!attachmentId) return jsonError("attachmentId verplicht.", 400);

  const pool = getPool();
  const [rows] = await pool.query<HlRow[]>(
    `SELECT h.id, h.attachment_id, h.page, h.quote, h.color, h.rects, h.note
     FROM highlights h
     JOIN attachments a ON a.id = h.attachment_id
     JOIN ref_items r ON r.id = a.reference_id
     WHERE h.attachment_id = ? AND r.user_id = ?
     ORDER BY h.page, h.created_at`,
    [attachmentId, session.userId],
  );

  return jsonOk({
    items: rows.map((h) => ({
      id: h.id,
      attachmentId: h.attachment_id,
      page: h.page,
      quote: h.quote,
      color: h.color,
      rects: (typeof h.rects === "string" ? JSON.parse(h.rects) : h.rects) as unknown,
      note: h.note,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;

  const body = (await req.json()) as {
    attachmentId?: string;
    page?: number;
    quote?: string;
    color?: string;
    rects?: unknown;
    note?: string;
  };

  if (!body.attachmentId || body.page === undefined || !body.rects) {
    return jsonError("attachmentId, page en rects zijn verplicht.", 400);
  }
  // Rechthoeken als fracties van de pagina (0–1), maximaal 200 per markering.
  const rects = Array.isArray(body.rects) ? body.rects.slice(0, 200) : [];
  const validRects = rects.every(
    (r) =>
      typeof r === "object" &&
      r !== null &&
      ["x", "y", "w", "h"].every((k) => typeof (r as Record<string, unknown>)[k] === "number"),
  );
  if (!validRects || !Number.isInteger(body.page) || body.page < 1) {
    return jsonError("Ongeldige markering.", 400);
  }
  const color = ["yellow", "green", "blue", "pink", "orange"].includes(body.color ?? "")
    ? body.color
    : "yellow";

  const pool = getPool();
  const [check] = await pool.query<RowDataPacket[]>(
    `SELECT a.id FROM attachments a
     JOIN ref_items r ON r.id = a.reference_id
     WHERE a.id = ? AND r.user_id = ? LIMIT 1`,
    [body.attachmentId, session.userId],
  );
  if (!check[0]) return jsonError("Bijlage niet gevonden.", 404);

  const id = randomUUID();
  await pool.query(
    `INSERT INTO highlights (id, attachment_id, page, quote, color, rects, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      body.attachmentId,
      body.page,
      body.quote?.slice(0, 5000) ?? null,
      color,
      JSON.stringify(rects),
      body.note?.slice(0, 5000) ?? null,
    ],
  );

  return jsonOk({ id }, 201);

}
