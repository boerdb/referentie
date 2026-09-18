import type { NextRequest } from "next/server";
import {
  createReference,
  listReferences,
} from "@/lib/references/queries";
import type { ReferenceInput } from "@/lib/references/types";
import { jsonError, jsonOk, requireSession } from "@/lib/api/http";

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;

  const { searchParams } = req.nextUrl;
  const items = await listReferences(session.userId, {
    q: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    starred: searchParams.get("starred") === "1",
    hasPdf: searchParams.get("hasPdf") === "1",
  });
  return jsonOk({ items });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;

  const body = (await req.json()) as ReferenceInput;
  if (!body.title?.trim()) {
    return jsonError("Titel is verplicht.", 400);
  }
  const item = await createReference(session.userId, body);
  return jsonOk({ item }, 201);
}
