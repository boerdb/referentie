import type { NextRequest } from "next/server";
import { checkDoiRateLimit } from "@/lib/auth/rate-limit";
import { identifyPdf, type PdfMatch } from "@/lib/pdf/identify";
import {
  createReference,
  deleteReference,
  getReference,
  getReferenceByDoi,
  restoreReference,
} from "@/lib/references/queries";
import {
  deletePdfFilesForReference,
  looksLikePdfFile,
  savePdfBufferForReference,
} from "@/lib/uploads/pdf";
import { jsonError, jsonOk, requireSession } from "@/lib/api/http";

function titleFromFileName(name: string): string {
  const base = name.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim();
  return base || "PDF zonder titel";
}

/**
 * Nieuw artikel van een PDF. Het artikel wordt alleen op DOI herkend als de titel volgens
 * Crossref ook op de eerste pagina staat (zie lib/pdf/identify.ts). Een bestaand artikel met
 * PDF wordt nooit overschreven.
 */
export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Bestand ontbreekt.", 400);
  if (!looksLikePdfFile(file)) return jsonError("Alleen PDF-bestanden.", 400);

  const buffer = Buffer.from(await file.arrayBuffer());
  // Controleer de inhoud vóór er een referentie wordt aangemaakt.
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return jsonError("Dit bestand is geen PDF.", 400);
  }
  if (!(await checkDoiRateLimit(session.userId))) {
    return jsonError("Te veel verzoeken. Wacht even.", 429);
  }

  let match: PdfMatch | null = null;
  try {
    match = await identifyPdf(new Uint8Array(buffer), file.name);
  } catch (e) {
    console.error("[from-pdf] herkennen mislukt", e);
  }

  // Zelfde artikel al in de bibliotheek?
  if (match) {
    const existing = await getReferenceByDoi(session.userId, match.doi);
    if (existing) {
      if (existing.deletedAt) await restoreReference(session.userId, existing.id);
      if (existing.hasPdf) {
        return jsonOk({
          item: await getReference(session.userId, existing.id),
          doi: match.doi,
          importSource: "duplicate",
          message: existing.deletedAt
            ? "Dit artikel stond in de prullenbak en is teruggezet; de PDF stond er al bij."
            : "Dit artikel staat al in je bibliotheek, met PDF. Er is niets veranderd.",
        });
      }
      try {
        await savePdfBufferForReference(session.userId, existing.id, buffer, file.name);
      } catch (e) {
        return jsonError(e instanceof Error ? e.message : "PDF opslaan mislukt.", 400);
      }
      return jsonOk(
        {
          item: await getReference(session.userId, existing.id),
          doi: match.doi,
          importSource: "existing",
          message: "PDF gekoppeld aan het artikel dat al in je bibliotheek stond.",
        },
        201,
      );
    }
  }

  const created = await createReference(
    session.userId,
    match?.metadata ?? { type: "article", title: titleFromFileName(file.name), authors: [] },
  );
  try {
    await savePdfBufferForReference(session.userId, created.id, buffer, file.name);
  } catch (e) {
    // Geen lege referentie achterlaten als de PDF niet kon worden opgeslagen.
    await deletePdfFilesForReference(session.userId, created.id);
    await deleteReference(session.userId, created.id);
    return jsonError(e instanceof Error ? e.message : "PDF opslaan mislukt.", 400);
  }

  return jsonOk(
    {
      item: await getReference(session.userId, created.id),
      doi: match?.doi ?? null,
      importSource: match ? "crossref" : "minimal",
      message: match
        ? "Artikel aangemaakt; gegevens via de DOI uit de PDF."
        : "Artikel aangemaakt, maar de DOI is niet zeker herkend. Vul de DOI in en kies 'Metadata ophalen'.",
    },
    201,
  );
}
