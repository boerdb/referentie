import type { NextRequest } from "next/server";
import {
  deleteReference,
  getReference,
  restoreReference,
  trashReference,
  updateReference,
} from "@/lib/references/queries";
import { setGroupMembership } from "@/lib/references/groups";
import { tagReferences } from "@/lib/references/tags";
import { parseReferenceInput, parseTagNames } from "@/lib/references/validate";
import { deletePdfFilesForReference } from "@/lib/uploads/pdf";
import { jsonError, jsonOk, readJson, requireSession } from "@/lib/api/http";

const MAX_IDS = 500;

type Body = {
  action?: "update" | "trash" | "restore" | "purge" | "tag" | "group";
  ids?: unknown;
  patch?: unknown;
  /** Bij "tag": naam van het trefwoord. Bij "group": id van de groep. */
  tag?: unknown;
  groupId?: unknown;
  remove?: unknown;
};

/** Eén actie op meerdere artikelen tegelijk (meervoudige selectie). */
export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;

  const body = ((await readJson(req)) ?? {}) as Body;
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((id): id is string => typeof id === "string"))]
    : [];
  if (ids.length === 0) return jsonError("Geen artikelen gekozen.", 400);
  if (ids.length > MAX_IDS) return jsonError(`Maximaal ${MAX_IDS} artikelen tegelijk.`, 400);

  let done = 0;
  switch (body.action) {
    case "update": {
      const parsed = parseReferenceInput(body.patch, { partial: true });
      if (!parsed.ok) return jsonError(parsed.error, 400);
      // Alleen velden die voor een selectie zinvol zijn.
      const { status, starred, label } = parsed.value;
      if (status === undefined && starred === undefined && label === undefined) {
        return jsonError("Alleen status, favoriet en label kunnen in bulk worden aangepast.", 400);
      }
      for (const id of ids) {
        if (await updateReference(session.userId, id, { status, starred, label })) done += 1;
      }
      break;
    }
    case "tag": {
      const parsed = parseTagNames([body.tag]);
      if (!parsed.ok || parsed.value.length !== 1) return jsonError("Geef een trefwoord.", 400);
      done = await tagReferences(session.userId, ids, parsed.value[0], body.remove === true);
      break;
    }
    case "group": {
      if (typeof body.groupId !== "string") return jsonError("Kies een groep.", 400);
      const result = await setGroupMembership(session.userId, body.groupId, ids, body.remove === true);
      if (result === null) return jsonError("Groep niet gevonden.", 404);
      done = result;
      break;
    }
    case "trash":
      for (const id of ids) if (await trashReference(session.userId, id)) done += 1;
      break;
    case "restore":
      for (const id of ids) if (await restoreReference(session.userId, id)) done += 1;
      break;
    case "purge":
      for (const id of ids) {
        const ref = await getReference(session.userId, id);
        if (!ref?.deletedAt) continue;
        await deletePdfFilesForReference(session.userId, id);
        if (await deleteReference(session.userId, id)) done += 1;
      }
      break;
    default:
      return jsonError("Onbekende actie.", 400);
  }
  return jsonOk({ done });
}
