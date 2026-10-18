import type { NextRequest } from "next/server";
import { deleteTag, renameTag } from "@/lib/references/tags";
import { parseTagNames } from "@/lib/references/validate";
import { jsonError, jsonOk, readJson, requireSession } from "@/lib/api/http";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const body = ((await readJson(req)) ?? {}) as { name?: unknown };
  const parsed = parseTagNames([body.name]);
  if (!parsed.ok || parsed.value.length !== 1) return jsonError("Geef een geldige naam.", 400);
  try {
    const ok = await renameTag(session.userId, id, parsed.value[0]);
    if (!ok) return jsonError("Trefwoord niet gevonden.", 404);
  } catch {
    return jsonError("Er bestaat al een trefwoord met die naam.", 409);
  }
  return jsonOk({ ok: true });
}

/** Verwijdert het trefwoord bij alle artikelen; de artikelen blijven staan. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const ok = await deleteTag(session.userId, id);
  if (!ok) return jsonError("Trefwoord niet gevonden.", 404);
  return jsonOk({ ok: true });
}
