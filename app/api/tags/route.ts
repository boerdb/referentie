import type { NextRequest } from "next/server";
import { listTags } from "@/lib/references/tags";
import { jsonOk, requireSession } from "@/lib/api/http";

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  return jsonOk({ tags: await listTags(session.userId) });
}
