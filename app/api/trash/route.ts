import type { NextRequest } from "next/server";
import { deleteReference, listTrashedIds } from "@/lib/references/queries";
import { deletePdfFilesForReference } from "@/lib/uploads/pdf";
import { jsonOk, requireSession } from "@/lib/api/http";

/** Prullenbak legen: alles daarin definitief verwijderen, inclusief PDF-bestanden. */
export async function DELETE(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;

  const ids = await listTrashedIds(session.userId);
  let deleted = 0;
  for (const id of ids) {
    await deletePdfFilesForReference(session.userId, id);
    if (await deleteReference(session.userId, id)) deleted += 1;
  }
  return jsonOk({ deleted });
}
