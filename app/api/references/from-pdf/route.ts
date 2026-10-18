import type { NextRequest } from "next/server";
import { checkDoiRateLimit } from "@/lib/auth/rate-limit";
import { cleanDoiForLookup, fetchMetadataByDoi } from "@/lib/doi/crossref";
import { findDoiInPdfBuffer } from "@/lib/pdf/extract-text";
import {
  createReference,
  getReference,
  deleteReference,
  getReferenceByDoi,
  restoreReference,
} from "@/lib/references/queries";
import type { ReferenceInput } from "@/lib/references/types";
import {
  deletePdfFilesForReference,
  looksLikePdfFile,
  savePdfBufferForReference,
} from "@/lib/uploads/pdf";
import { jsonError, jsonOk, requireSession } from "@/lib/api/http";

function titleFromFileName(name: string): string {
  const base = name.replace(/\.pdf$/i, "").trim();
  return base || "PDF zonder titel";
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonError("Bestand ontbreekt.", 400);
  }
  if (!looksLikePdfFile(file)) {
    return jsonError("Alleen PDF-bestanden.", 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Controleer de inhoud vóór er een referentie wordt aangemaakt.
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return jsonError("Dit bestand is geen PDF.", 400);
  }
  const data = new Uint8Array(buffer);

  let doi: string | null = null;
  try {
    doi = await findDoiInPdfBuffer(data);
  } catch (e) {
    console.error("doi extract", e);
  }

  let referenceId: string;
  let importSource: "existing" | "crossref" | "minimal";

  if (doi) {
    const normalized = cleanDoiForLookup(doi);
    const existing = await getReferenceByDoi(session.userId, normalized);
    if (existing) {
      if (existing.deletedAt) await restoreReference(session.userId, existing.id);
      referenceId = existing.id;
      importSource = "existing";
    } else {
      if (!(await checkDoiRateLimit(session.userId))) {
        return jsonError("Te veel DOI-verzoeken. Wacht even.", 429);
      }
      let metadata: ReferenceInput;
      try {
        metadata = await fetchMetadataByDoi(normalized);
        importSource = "crossref";
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Crossref mislukt.";
        console.warn("crossref fallback after doi in pdf", msg);
        metadata = {
          type: "article",
          title: titleFromFileName(file.name),
          doi: normalized,
          authors: [],
        };
        importSource = "minimal";
      }
      const item = await createReference(session.userId, metadata);
      referenceId = item.id;
    }
  } else {
    const item = await createReference(session.userId, {
      type: "article",
      title: titleFromFileName(file.name),
      authors: [],
    });
    referenceId = item.id;
    importSource = "minimal";
  }

  try {
    await savePdfBufferForReference(session.userId, referenceId, buffer, file.name);
  } catch (e) {
    // Geen lege referentie achterlaten als de PDF niet kon worden opgeslagen.
    if (importSource !== "existing") {
      await deletePdfFilesForReference(session.userId, referenceId);
      await deleteReference(session.userId, referenceId);
    }
    const msg = e instanceof Error ? e.message : "PDF opslaan mislukt.";
    return jsonError(msg, 400);
  }

  const item = await getReference(session.userId, referenceId);
  if (!item) return jsonError("Referentie niet gevonden.", 500);

  return jsonOk(
    {
      item,
      doi,
      importSource,
      message:
        importSource === "existing"
          ? "PDF gekoppeld aan bestaand artikel (zelfde DOI)."
          : importSource === "crossref"
            ? "Artikel aangemaakt via DOI uit PDF."
            : doi
              ? "Artikel aangemaakt; metadata deels ingevuld."
              : "Artikel aangemaakt zonder DOI — vul gegevens aan.",
    },
    201,
  );
}
