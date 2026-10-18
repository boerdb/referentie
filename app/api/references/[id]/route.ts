import type { NextRequest } from "next/server";
import {
  deleteReference,
  getReference,
  trashReference,
  updateReference,
} from "@/lib/references/queries";
import { parseReferenceInput } from "@/lib/references/validate";
import { cleanDoiForLookup } from "@/lib/doi/crossref";
import { ensureOpenAccessPdf } from "@/lib/doi/oa-pdf";
import { deletePdfFilesForReference } from "@/lib/uploads/pdf";
import { jsonError, jsonOk, readJson, requireSession } from "@/lib/api/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const item = await getReference(session.userId, id);
  if (!item) return jsonError("Niet gevonden.", 404);
  return jsonOk({ item });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const parsed = parseReferenceInput(await readJson(req), { partial: true });
  if (!parsed.ok) return jsonError(parsed.error, 400);
  const body = parsed.value;
  if (body.doi !== undefined) {
    const raw = body.doi?.trim() ?? "";
    body.doi = raw ? cleanDoiForLookup(raw) : null;
  }
  const updated = await updateReference(session.userId, id, body);
  if (!updated) return jsonError("Niet gevonden.", 404);
  const item = body.doi
    ? await ensureOpenAccessPdf(session.userId, updated)
    : updated;
  return jsonOk({ item });
}

/**
 * Standaard naar de prullenbak. Met `?permanent=1` definitief, alleen voor iets dat al
 * in de prullenbak staat.
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;

  if (req.nextUrl.searchParams.get("permanent") !== "1") {
    const ok = await trashReference(session.userId, id);
    if (!ok) return jsonError("Niet gevonden.", 404);
    return jsonOk({ ok: true, trashed: true });
  }

  const existing = await getReference(session.userId, id);
  if (!existing) return jsonError("Niet gevonden.", 404);
  if (!existing.deletedAt) {
    return jsonError("Zet het artikel eerst in de prullenbak.", 409);
  }
  await deletePdfFilesForReference(session.userId, id);
  await deleteReference(session.userId, id);
  return jsonOk({ ok: true, trashed: false });
}
