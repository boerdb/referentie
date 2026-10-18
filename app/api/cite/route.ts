import type { NextRequest } from "next/server";
import { formatBibliography } from "@/lib/cite/csl";
import { isCslStyle } from "@/lib/cite/styles";
import { listReferences } from "@/lib/references/queries";
import { jsonError, jsonOk, readJson, requireSession } from "@/lib/api/http";

/**
 * Bibliografie van meerdere artikelen in één stijl. De volgorde van `ids` blijft behouden,
 * zodat nummerstijlen (Vancouver, AMA) in die volgorde nummeren.
 */
export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;

  const body = ((await readJson(req)) ?? {}) as { ids?: unknown; style?: unknown };
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((id): id is string => typeof id === "string"))].slice(0, 500)
    : [];
  if (ids.length === 0) return jsonError("Kies een of meer artikelen.", 400);
  const style = isCslStyle(body.style) ? body.style : "vancouver";

  const found = await listReferences(session.userId, { ids });
  const byId = new Map(found.map((r) => [r.id, r]));
  const refs = ids.map((id) => byId.get(id)).filter((r) => r !== undefined);

  try {
    return jsonOk({ style, ...formatBibliography(refs, style) });
  } catch (e) {
    console.error("[cite]", e);
    return jsonError("Opmaken in deze stijl mislukt.", 500);
  }
}
