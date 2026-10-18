import type { NextRequest } from "next/server";
import { countReferences } from "@/lib/references/queries";
import { jsonOk, requireSession } from "@/lib/api/http";

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  return jsonOk({ counts: await countReferences(session.userId) });
}
