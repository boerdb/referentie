import type { NextRequest } from "next/server";
import { getPdfForUser, savePdfForReference } from "@/lib/uploads/pdf";
import { getReference } from "@/lib/references/queries";
import { jsonError, requireSession } from "@/lib/api/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;

  const pdf = await getPdfForUser(session.userId, id);
  if (!pdf) return jsonError("Geen PDF voor dit artikel.", 404);

  return new Response(new Uint8Array(pdf.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(pdf.fileName)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;

  const ref = await getReference(session.userId, id);
  if (!ref) return jsonError("Niet gevonden.", 404);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonError("Bestand ontbreekt.", 400);
  }

  try {
    await savePdfForReference(session.userId, id, file);
    const item = await getReference(session.userId, id);
    return Response.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload mislukt.";
    return jsonError(msg, 400);
  }
}
