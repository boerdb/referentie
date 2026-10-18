import type { NextRequest } from "next/server";
import { getReference } from "@/lib/references/queries";
import { listAttachments, savePdfForReference } from "@/lib/uploads/pdf";
import { jsonError, jsonOk, requireSession } from "@/lib/api/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  return jsonOk({ items: await listAttachments(session.userId, id) });
}

/** Extra bijlage (supplement, protocol) toevoegen; de hoofd-PDF blijft staan. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;

  const ref = await getReference(session.userId, id);
  if (!ref) return jsonError("Niet gevonden.", 404);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Bestand ontbreekt.", 400);
  const label = form.get("label");

  try {
    const { attachmentId } = await savePdfForReference(session.userId, id, file, {
      replace: false,
      label: typeof label === "string" ? label : null,
    });
    return jsonOk(
      { attachmentId, items: await listAttachments(session.userId, id), item: await getReference(session.userId, id) },
      201,
    );
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Upload mislukt.", 400);
  }
}
