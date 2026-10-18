"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toaster";
import { formatBibtex, formatShareSummary } from "@/lib/cite/formats";
import type { ReferenceRecord } from "@/lib/references/types";
import { pdfFileNameFromTitle, shareOrCopyText, shareOrDownloadPdf } from "@/lib/share/files";

export type ExportMode = "pdf" | "summary" | "bibtex";

/** Delen of kopiëren van een artikel: als PDF, als korte samenvatting of als BibTeX. */
export function useExport() {
  const toast = useToast();
  const [exporting, setExporting] = useState(false);

  async function exportReference(ref: ReferenceRecord, mode: ExportMode = "pdf") {
    if (exporting) return;
    setExporting(true);
    try {
      if (mode === "bibtex") {
        const result = await shareOrCopyText(formatBibtex(ref), { title: ref.title });
        if (result === "copied") toast.success("BibTeX gekopieerd");
        return;
      }
      if (mode === "summary" || !ref.hasPdf) {
        const result = await shareOrCopyText(formatShareSummary(ref), { title: ref.title });
        if (result === "copied") toast.success("Artikelinfo gekopieerd");
        return;
      }
      await shareOrDownloadPdf(`/api/references/${ref.id}/pdf`, {
        fileName: pdfFileNameFromTitle(ref.title),
        title: ref.title,
      });
    } catch (err) {
      toast.error("Exporteren mislukt", err instanceof Error ? err.message : undefined);
    } finally {
      setExporting(false);
    }
  }

  return { exporting, exportReference };
}
