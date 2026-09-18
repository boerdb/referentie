import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { SessionPayload } from "@/lib/auth/session";
import { getSessionFromRequest } from "@/lib/auth/session";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireSession(
  req: NextRequest,
): Promise<SessionPayload | NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return jsonError("Niet ingelogd.", 401);
  }
  return session;
}
