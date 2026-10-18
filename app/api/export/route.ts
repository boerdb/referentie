import type { NextRequest } from "next/server";
import { toBibtex, toRis } from "@/lib/exchange/export";
import { listReferences } from "@/lib/references/queries";
import { jsonError, readJson, requireSession } from "@/lib/api/http";

/** Download van de gekozen artikelen als .ris of .bib. */
export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;

  const body = ((await readJson(req)) ?? {}) as { ids?: unknown; format?: unknown };
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((id): id is string => typeof id === "string"))].slice(0, 5000)
    : [];
  if (ids.length === 0) return jsonError("Kies een of meer artikelen.", 400);
  const format = body.format === "bibtex" ? "bibtex" : "ris";

  const found = await listReferences(session.userId, { ids });
  const byId = new Map(found.map((r) => [r.id, r]));
  const refs = ids.map((id) => byId.get(id)).filter((r) => r !== undefined);

  const text = format === "bibtex" ? toBibtex(refs) : toRis(refs);
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `referenties-${stamp}.${format === "bibtex" ? "bib" : "ris"}`;
  return new Response(text, {
    headers: {
      "Content-Type": format === "bibtex" ? "application/x-bibtex; charset=utf-8" : "application/x-research-info-systems; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
