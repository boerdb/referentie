import type { NextRequest } from "next/server";
import { checkAndStoreRetraction } from "@/lib/doi/retraction";
import { getReference } from "@/lib/references/queries";
import { jsonError, jsonOk, requireSession } from "@/lib/api/http";

type Ctx = { params: Promise<{ id: string }> };

/** Nu controleren of het artikel is teruggetrokken (Crossref / Retraction Watch). */
export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const ref = await getReference(session.userId, id);
  if (!ref) return jsonError("Niet gevonden.", 404);
  if (!ref.doi) return jsonError("Zonder DOI kan dit niet worden gecontroleerd.", 400);
  const info = await checkAndStoreRetraction(ref.id, ref.doi);
  if (info === undefined) return jsonError("Crossref is nu niet bereikbaar. Probeer het later.", 502);
  return jsonOk({ retraction: info, item: await getReference(session.userId, id) });
}
