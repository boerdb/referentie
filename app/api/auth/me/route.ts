import type { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/api/http";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return jsonError("Niet ingelogd.", 401);
  return jsonOk({ user: session });
}
