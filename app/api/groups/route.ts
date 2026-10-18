import type { NextRequest } from "next/server";
import { createGroup, isValidParent, listGroups } from "@/lib/references/groups";
import { parseSmartRules } from "@/lib/references/smart";
import { jsonError, jsonOk, readJson, requireSession } from "@/lib/api/http";

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  return jsonOk({ groups: await listGroups(session.userId) });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;

  const body = ((await readJson(req)) ?? {}) as {
    name?: unknown;
    kind?: unknown;
    parentId?: unknown;
    rules?: unknown;
  };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 255) return jsonError("Geef de groep een naam (max. 255 tekens).", 400);
  const kind = body.kind === "smart" ? "smart" : "manual";

  let rules = null;
  if (kind === "smart") {
    const parsed = parseSmartRules(body.rules);
    if (!parsed.ok) return jsonError(parsed.error, 400);
    rules = parsed.value;
  }

  const parentId = typeof body.parentId === "string" ? body.parentId : null;
  if (parentId && !(await isValidParent(session.userId, null, parentId))) {
    return jsonError("Ongeldige bovenliggende groep.", 400);
  }

  const id = await createGroup(session.userId, { name, kind, parentId, rules });
  return jsonOk({ id }, 201);
}
