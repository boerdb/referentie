import type { NextRequest } from "next/server";
import { checkDoiRateLimit } from "@/lib/auth/rate-limit";
import {
  cleanDoiForLookup,
  fetchMetadataByDoi,
  normalizeDoi,
} from "@/lib/doi/crossref";
import { getReference, updateReference } from "@/lib/references/queries";
import { jsonError, jsonOk, requireSession } from "@/lib/api/http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;

  if (!(await checkDoiRateLimit(session.userId))) {
    return jsonError("Te veel DOI-verzoeken. Wacht even.", 429);
  }

  const { id } = await ctx.params;
  const existing = await getReference(session.userId, id);
  if (!existing) return jsonError("Niet gevonden.", 404);

  const body = (await req.json().catch(() => ({}))) as { doi?: string };
  const rawDoi = body.doi?.trim() || existing.doi;
  if (!rawDoi) {
    return jsonError("Geen DOI — vul eerst een DOI in of importeer opnieuw.", 400);
  }

  try {
    const metadata = await fetchMetadataByDoi(rawDoi);
    const cleanedDoi = cleanDoiForLookup(metadata.doi ?? rawDoi);

    const item = await updateReference(session.userId, id, {
      title: metadata.title,
      abstract: metadata.abstract,
      year: metadata.year,
      journal: metadata.journal,
      volume: metadata.volume,
      issue: metadata.issue,
      pages: metadata.pages,
      doi: cleanedDoi || normalizeDoi(rawDoi),
      url: metadata.url,
      authors: metadata.authors,
    });

    if (!item) return jsonError("Bijwerken mislukt.", 500);
    return jsonOk({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Metadata ophalen mislukt.";
    return jsonError(msg, 400);
  }
}
