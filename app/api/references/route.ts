import type { NextRequest } from "next/server";
import { ensureOpenAccessPdf } from "@/lib/doi/oa-pdf";
import {
  createReference,
  listReferences,
} from "@/lib/references/queries";
import type { ReferenceInput } from "@/lib/references/types";
import { jsonError, jsonOk, readJson, requireSession } from "@/lib/api/http";
import { parseReferenceInput } from "@/lib/references/validate";

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

  const parsed = parseReferenceInput(await readJson(req), { partial: false });
  if (!parsed.ok) return jsonError(parsed.error, 400);
  const body = parsed.value as ReferenceInput;
  const created = await createReference(session.userId, body);
  const item = body.doi?.trim()
    ? await ensureOpenAccessPdf(session.userId, created)
    : created;
  return jsonOk({ item }, 201);
}
