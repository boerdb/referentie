import type { NextRequest } from "next/server";
import { findDuplicateSets } from "@/lib/references/duplicates";
import { countReferences } from "@/lib/references/queries";
import { jsonOk, requireSession } from "@/lib/api/http";

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const [counts, sets] = await Promise.all([
    countReferences(session.userId),
    findDuplicateSets(session.userId),
  ]);
  return jsonOk({ counts: { ...counts, duplicates: sets.reduce((n, set) => n + set.length, 0) } });
}
