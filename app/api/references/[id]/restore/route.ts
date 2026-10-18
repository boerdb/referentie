import type { NextRequest } from "next/server";
import { getReference, restoreReference } from "@/lib/references/queries";
import { jsonError, jsonOk, requireSession } from "@/lib/api/http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const ok = await restoreReference(session.userId, id);
  if (!ok) return jsonError("Niet gevonden in de prullenbak.", 404);
  return jsonOk({ item: await getReference(session.userId, id) });
}
