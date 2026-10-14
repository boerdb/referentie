import type { NextRequest } from "next/server";
import { checkSearchRateLimit } from "@/lib/auth/rate-limit";
import { jsonError, jsonOk, requireSession } from "@/lib/api/http";
import { findReferenceIdsByDois } from "@/lib/references/queries";
import { isSearchSource, searchLiterature } from "@/lib/search/literature";

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;

  if (!(await checkSearchRateLimit(session.userId))) {
    return jsonError("Te veel zoekopdrachten. Wacht even.", 429);
  }

  const sourceRaw = req.nextUrl.searchParams.get("source") ?? "pubmed";
  if (!isSearchSource(sourceRaw)) return jsonError("Onbekende bron.", 400);
  const query = req.nextUrl.searchParams.get("q") ?? "";
  const cursor = (req.nextUrl.searchParams.get("cursor") ?? "").slice(0, 500);

  try {
    const result = await searchLiterature(sourceRaw, query, cursor);
    const matches = await findReferenceIdsByDois(
      session.userId,
      result.items.flatMap((item) => (item.doi ? [item.doi] : [])),
    );
    return jsonOk({
      ...result,
      items: result.items.map((item) => {
        const libraryId = item.doi ? (matches.get(item.doi.toLowerCase()) ?? null) : null;
        return { ...item, inLibrary: Boolean(libraryId), libraryId };
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Zoeken mislukt.";
    return jsonError(msg, 400);
  }
}
