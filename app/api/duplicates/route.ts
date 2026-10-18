import type { NextRequest } from "next/server";
import { findDuplicateSets, mergeReferences } from "@/lib/references/duplicates";
import { getReference } from "@/lib/references/queries";
import { jsonError, jsonOk, readJson, requireSession } from "@/lib/api/http";

/** Sets van mogelijk dubbele artikelen (alleen id's). */
export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  return jsonOk({ sets: await findDuplicateSets(session.userId) });
}

/** Samenvoegen: `keepId` blijft, `mergeIds` gaan na het overnemen naar de prullenbak. */
export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const body = ((await readJson(req)) ?? {}) as { keepId?: unknown; mergeIds?: unknown };
  const keepId = typeof body.keepId === "string" ? body.keepId : "";
  const mergeIds = Array.isArray(body.mergeIds)
    ? body.mergeIds.filter((id): id is string => typeof id === "string").slice(0, 50)
    : [];
  if (!keepId || mergeIds.length === 0) return jsonError("Kies wat je wilt samenvoegen.", 400);

  const ok = await mergeReferences(session.userId, keepId, mergeIds);
  if (!ok) return jsonError("Samenvoegen mislukt: artikelen niet gevonden of al verwijderd.", 404);
  return jsonOk({ item: await getReference(session.userId, keepId) });
}
