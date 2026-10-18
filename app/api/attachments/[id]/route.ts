import type { NextRequest } from "next/server";
import { getReference } from "@/lib/references/queries";
import { contentDisposition, niceFileName } from "@/lib/uploads/file-name";
import {
  deleteAttachment,
  getAttachmentFile,
  listAttachments,
  updateAttachment,
} from "@/lib/uploads/pdf";
import { jsonError, jsonOk, readJson, requireSession } from "@/lib/api/http";

type Ctx = { params: Promise<{ id: string }> };

/** De PDF van één bijlage (inline, of met ?download=1 als bestand). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;

  const file = await getAttachmentFile(session.userId, id);
  if (!file) return jsonError("Bijlage niet gevonden.", 404);
  const ref = await getReference(session.userId, file.referenceId);
  const label = ref
    ? (await listAttachments(session.userId, ref.id)).find((a) => a.id === id)?.label
    : null;
  const name = ref ? niceFileName(ref, label) : file.fileName;

  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition(name, req.nextUrl.searchParams.get("download") === "1"),
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const body = ((await readJson(req)) ?? {}) as { label?: unknown; makePrimary?: unknown };
  const label =
    body.label === undefined ? undefined : typeof body.label === "string" ? body.label : null;
  const ok = await updateAttachment(session.userId, id, {
    label,
    makePrimary: body.makePrimary === true,
  });
  if (!ok) return jsonError("Bijlage niet gevonden.", 404);
  return jsonOk({ ok: true });
}

/** Bijlage verwijderen (bestand en markeringen gaan mee). */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const ok = await deleteAttachment(session.userId, id);
  if (!ok) return jsonError("Bijlage niet gevonden.", 404);
  return jsonOk({ ok: true });
}
