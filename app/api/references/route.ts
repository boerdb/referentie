import type { NextRequest } from "next/server";
import { ensureOpenAccessPdf } from "@/lib/doi/oa-pdf";
import {
  createReference,
  listReferences,
  SEARCH_FIELDS,
  type ListFilters,
  type SearchField,
} from "@/lib/references/queries";
import { findDuplicateSets } from "@/lib/references/duplicates";
import { getGroup } from "@/lib/references/groups";
import type { ReferenceInput } from "@/lib/references/types";
import { jsonError, jsonOk, readJson, requireSession } from "@/lib/api/http";
import { parseReferenceInput } from "@/lib/references/validate";

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;

  const { searchParams } = req.nextUrl;
  const filters: ListFilters = {
    q: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    starred: searchParams.get("starred") === "1",
    hasPdf: searchParams.get("hasPdf") === "1",
    trash: searchParams.get("trash") === "1",
    field: SEARCH_FIELDS.find((f) => f === searchParams.get("in")) as SearchField | undefined,
    tagId: searchParams.get("tag") ?? undefined,
  };

  const label = Number(searchParams.get("label"));
  if (Number.isInteger(label) && label >= 1 && label <= 7) filters.label = label;

  const groupId = searchParams.get("group");
  if (groupId) {
    const group = await getGroup(session.userId, groupId);
    if (!group) return jsonError("Groep niet gevonden.", 404);
    if (group.kind === "smart") {
      if (!group.rules) return jsonOk({ items: [] });
      filters.smart = group.rules;
    } else {
      filters.groupId = group.id;
    }
  }

  if (searchParams.get("duplicates") === "1") {
    // Sets achter elkaar, zodat dubbelen in de lijst naast elkaar staan.
    const sets = await findDuplicateSets(session.userId);
    const ids = sets.flat();
    const items = await listReferences(session.userId, { ...filters, ids });
    const order = new Map(ids.map((id, i) => [id, i]));
    items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return jsonOk({ items, sets });
  }

  const items = await listReferences(session.userId, filters);
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
