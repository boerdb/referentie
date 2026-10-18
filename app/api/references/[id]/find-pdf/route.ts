import type { NextRequest } from "next/server";
import { checkDoiRateLimit } from "@/lib/auth/rate-limit";
import { findPdfForReference } from "@/lib/doi/find-pdf";
import { getReference, updateReference } from "@/lib/references/queries";
import { savePdfBufferForReference } from "@/lib/uploads/pdf";
import { jsonError, jsonOk, requireSession } from "@/lib/api/http";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Zoekt online een vrij beschikbare PDF (OpenAlex, Unpaywall, Europe PMC) en koppelt die.
 * Zonder DOI wordt de DOI eerst op titel gezocht en, als hij zeker overeenkomt, opgeslagen.
 * Niets gevonden: links om zelf verder te zoeken.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;

  const ref = await getReference(session.userId, id);
  if (!ref) return jsonError("Niet gevonden.", 404);
  if (!(await checkDoiRateLimit(session.userId))) {
    return jsonError("Te veel zoekopdrachten. Wacht even.", 429);
  }

  const result = await findPdfForReference(ref);
  const doiAdded = Boolean(result.doi && !ref.doi);
  if (doiAdded) await updateReference(session.userId, id, { doi: result.doi });

  if (!result.found) {
    return jsonOk({
      found: false,
      doi: result.doi,
      doiAdded,
      links: result.links,
      item: await getReference(session.userId, id),
    });
  }

  try {
    await savePdfBufferForReference(session.userId, id, result.buffer, result.fileName);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "PDF opslaan mislukt.", 500);
  }
  return jsonOk({ found: true, doi: result.doi, doiAdded, item: await getReference(session.userId, id) });
}
