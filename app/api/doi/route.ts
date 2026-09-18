import type { NextRequest } from "next/server";
import { checkDoiRateLimit } from "@/lib/auth/rate-limit";
import { fetchMetadataByDoi } from "@/lib/doi/crossref";
import { createReference } from "@/lib/references/queries";
import { jsonError, jsonOk, requireSession } from "@/lib/api/http";

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;

  if (!(await checkDoiRateLimit(session.userId))) {
    return jsonError("Te veel DOI-verzoeken. Wacht even.", 429);
  }

  const body = (await req.json()) as { doi?: string; save?: boolean };
  const doi = body.doi?.trim();
  if (!doi) return jsonError("DOI is verplicht.", 400);

  try {
    const metadata = await fetchMetadataByDoi(doi);
    if (body.save) {
      const item = await createReference(session.userId, metadata);
      return jsonOk({ metadata, item }, 201);
    }
    return jsonOk({ metadata });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "DOI ophalen mislukt.";
    return jsonError(msg, 400);
  }
}
