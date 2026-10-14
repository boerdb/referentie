import type { NextRequest } from "next/server";
import { checkDoiRateLimit } from "@/lib/auth/rate-limit";
import { fetchCitations, type CitationDirection } from "@/lib/doi/citations";
import { jsonError, jsonOk, requireSession } from "@/lib/api/http";
import { findReferenceIdsByDois, getReference } from "@/lib/references/queries";

type Ctx = { params: Promise<{ id: string }> };

function directionFrom(value: string | null): CitationDirection | null {
  if (value === "references" || value === "cited-by") return value;
  return null;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;

  if (!(await checkDoiRateLimit(session.userId))) {
    return jsonError("Te veel DOI-verzoeken. Wacht even.", 429);
  }

  const { id } = await ctx.params;
  const existing = await getReference(session.userId, id);
  if (!existing) return jsonError("Niet gevonden.", 404);
  if (!existing.doi) {
    return jsonError("Geen DOI — vul eerst een DOI in.", 400);
  }

  const direction = directionFrom(req.nextUrl.searchParams.get("direction") ?? "references");
  if (!direction) return jsonError("Ongeldige richting.", 400);

  const page = Number(req.nextUrl.searchParams.get("page") ?? "1");
  const query = req.nextUrl.searchParams.get("q") ?? "";

  try {
    const result = await fetchCitations(existing.doi, {
      direction,
      page: Number.isFinite(page) ? page : 1,
      query,
    });
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
    const msg = e instanceof Error ? e.message : "Kruisverwijzingen ophalen mislukt.";
    return jsonError(msg, 400);
  }
}
