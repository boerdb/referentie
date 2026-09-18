import type { NextRequest } from "next/server";
import {
  deleteReference,
  getReference,
  updateReference,
} from "@/lib/references/queries";
import type { ReferenceInput } from "@/lib/references/types";
import { deletePdfFilesForReference } from "@/lib/uploads/pdf";
import { jsonError, jsonOk, requireSession } from "@/lib/api/http";

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
  const body = (await req.json()) as Partial<ReferenceInput>;
  const item = await updateReference(session.userId, id, body);
  if (!item) return jsonError("Niet gevonden.", 404);
  return jsonOk({ item });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  await deletePdfFilesForReference(session.userId, id);
  const ok = await deleteReference(session.userId, id);
  if (!ok) return jsonError("Niet gevonden.", 404);
  return jsonOk({ ok: true });
}
