import type { NextRequest } from "next/server";
import { deleteGroup, getGroup, isValidParent, updateGroup } from "@/lib/references/groups";
import { parseSmartRules, type SmartRules } from "@/lib/references/smart";
import { jsonError, jsonOk, readJson, requireSession } from "@/lib/api/http";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;

  const group = await getGroup(session.userId, id);
  if (!group) return jsonError("Groep niet gevonden.", 404);

  const body = ((await readJson(req)) ?? {}) as {
    name?: unknown;
    parentId?: unknown;
    rules?: unknown;
  };
  const update: { name?: string; parentId?: string | null; rules?: SmartRules } = {};

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 255) return jsonError("Geef de groep een naam (max. 255 tekens).", 400);
    update.name = name;
  }
  if (body.parentId !== undefined) {
    if (group.kind !== "manual") return jsonError("Slimme groepen kun je niet nesten.", 400);
    const parentId = typeof body.parentId === "string" ? body.parentId : null;
    if (parentId && !(await isValidParent(session.userId, id, parentId))) {
      return jsonError("Een groep kan niet in zichzelf of in een eigen subgroep staan.", 400);
    }
    update.parentId = parentId;
  }
  if (body.rules !== undefined) {
    if (group.kind !== "smart") return jsonError("Alleen slimme groepen hebben regels.", 400);
    const parsed = parseSmartRules(body.rules);
    if (!parsed.ok) return jsonError(parsed.error, 400);
    update.rules = parsed.value;
  }

  await updateGroup(session.userId, id, update);
  return jsonOk({ group: await getGroup(session.userId, id) });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const ok = await deleteGroup(session.userId, id);
  if (!ok) return jsonError("Groep niet gevonden.", 404);
  return jsonOk({ ok: true });
}
