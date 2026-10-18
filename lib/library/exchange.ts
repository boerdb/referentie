"use client";

import { api } from "@/lib/api/client";
import { shareOrDownloadFile } from "@/lib/share/files";

export type ExportFormat = "ris" | "bibtex";

/** Haalt een .ris- of .bib-bestand op en downloadt of deelt het. */
export async function exportReferences(ids: string[], format: ExportFormat): Promise<void> {
  const res = await fetch("/api/export", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, format }),
  });
  if (!res.ok) {
    let message = `Exporteren mislukt (HTTP ${res.status}).`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* geen JSON */
    }
    throw new Error(message);
  }
  const name =
    res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
    `referenties.${format === "bibtex" ? "bib" : "ris"}`;
  await shareOrDownloadFile(await res.blob(), name);
}

export type ImportResult = {
  format: "ris" | "bibtex" | "medline";
  created: number;
  skipped: number;
  failed: number;
  ids: string[];
};

const FORMAT_LABEL: Record<ImportResult["format"], string> = {
  ris: "RIS",
  bibtex: "BibTeX",
  medline: "PubMed",
};

export function importFormatLabel(format: ImportResult["format"]): string {
  return FORMAT_LABEL[format];
}

export async function importFile(file: File, groupId: string | null) {
  const fd = new FormData();
  fd.set("file", file);
  if (groupId) fd.set("groupId", groupId);
  return api<ImportResult>("/api/import", { method: "POST", body: fd });
}

/** PDF's en literatuurbestanden; de app kiest per bestand de juiste import. */
export const IMPORT_ACCEPT =
  ".pdf,application/pdf,.ris,.bib,.bibtex,.nbib,.txt,application/x-research-info-systems,application/x-bibtex,text/plain";
