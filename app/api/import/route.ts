import type { NextRequest } from "next/server";
import { detectFormat, parseReferences } from "@/lib/exchange/parse";
import { setGroupMembership } from "@/lib/references/groups";
import { createReference, findReferenceIdsByDois } from "@/lib/references/queries";
import type { ReferenceInput } from "@/lib/references/types";
import { parseReferenceInput } from "@/lib/references/validate";
import { jsonError, jsonOk, requireSession } from "@/lib/api/http";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_RECORDS = 2000;

/**
 * Importeert een RIS-, BibTeX- of PubMed-bestand (.ris, .bib, .nbib, .txt).
 * Artikelen met een DOI die al in de bibliotheek staat worden overgeslagen.
 * Optioneel `groupId`: de geïmporteerde artikelen komen ook in die groep.
 */
export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Bestand ontbreekt.", 400);
  if (file.size > MAX_BYTES) return jsonError("Bestand is groter dan 10 MB.", 400);

  const content = await file.text();
  const format = detectFormat(content);
  if (!format) {
    return jsonError("Onbekend formaat. Gebruik RIS, BibTeX of PubMed (MEDLINE/.nbib).", 400);
  }
  const parsed = parseReferences(content, format);
  if (parsed.length === 0) return jsonError("Geen artikelen gevonden in dit bestand.", 400);
  if (parsed.length > MAX_RECORDS) {
    return jsonError(`Maximaal ${MAX_RECORDS} artikelen per bestand.`, 400);
  }

  // DOI's die al bestaan (ook binnen het bestand zelf) overslaan.
  const existing = await findReferenceIdsByDois(
    session.userId,
    parsed.map((p) => p.doi ?? "").filter(Boolean),
  );
  const seen = new Set(existing.keys());

  const ids: string[] = [];
  let skipped = 0;
  let failed = 0;
  for (const raw of parsed) {
    const doi = raw.doi?.toLowerCase();
    if (doi && seen.has(doi)) {
      skipped += 1;
      continue;
    }
    // Zelfde controle als bij handmatig toevoegen (lengtes, jaartal, trefwoorden).
    const checked = parseReferenceInput(
      { ...raw, title: raw.title.slice(0, 1024), tags: raw.tags?.slice(0, 50) },
      { partial: false },
    );
    if (!checked.ok) {
      failed += 1;
      continue;
    }
    try {
      const created = await createReference(session.userId, checked.value as ReferenceInput);
      ids.push(created.id);
      if (doi) seen.add(doi);
    } catch (e) {
      console.warn("[import]", e instanceof Error ? e.message : e);
      failed += 1;
    }
  }

  const groupId = form.get("groupId");
  if (typeof groupId === "string" && groupId && ids.length > 0) {
    await setGroupMembership(session.userId, groupId, ids);
  }

  return jsonOk({ format, created: ids.length, skipped, failed, ids }, 201);
}
