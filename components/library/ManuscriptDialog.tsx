"use client";

import { useState } from "react";
import { FileText, Loader2, X } from "lucide-react";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/api/client";
import { CSL_STYLES, CSL_STYLE_IDS, type CslStyleId } from "@/lib/cite/styles";
import type { ReferenceRecord } from "@/lib/references/types";
import { shareOrDownloadFile } from "@/lib/share/files";
import { useCiteStyle } from "./inspector/useCitationCopy";

/** Tijdelijk citaat zoals Bookends: {Meyhoff 2022 #3fa9c1e2}. */
export function temporaryCitation(refs: ReferenceRecord[]): string {
  return `{${refs
    .map((r) => {
      const author = r.authors[0]?.familyName || r.title.split(" ")[0];
      return [author, r.year, `#${r.id.replace(/-/g, "").slice(0, 8)}`].filter(Boolean).join(" ");
    })
    .join("; ")}}`;
}

type Report = {
  style: string;
  citations: number;
  references: number;
  unresolved: string[];
  mergedRuns: number;
};

export function ManuscriptDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [defaultStyle] = useCiteStyle();
  const [style, setStyle] = useState<CslStyleId>(defaultStyle);
  const [file, setFile] = useState<File | null>(null);
  const [heading, setHeading] = useState("References");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);

  async function run() {
    if (!file) return;
    setBusy(true);
    setReport(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("style", style);
    fd.set("heading", heading);
    const res = await api<{ fileName: string; file: string; report: Report }>("/api/manuscript", {
      method: "POST",
      body: fd,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error("Manuscript opmaken mislukt", res.error);
      return;
    }
    const bytes = Uint8Array.from(atob(res.data.file), (c) => c.charCodeAt(0));
    await shareOrDownloadFile(
      new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
      res.data.fileName,
    );
    setReport(res.data.report);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 max-lg:items-end max-lg:p-0"
      style={{ background: "var(--overlay)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="manuscript-title"
        className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] shadow-[var(--shadow-lg)] max-lg:max-w-none max-lg:rounded-b-none max-lg:rounded-t-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 id="manuscript-title" className="text-base font-semibold">
              Word-manuscript opmaken
            </h2>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">
              Tijdelijke citaten worden opgemaakte citaten, met een literatuurlijst achteraan.
            </p>
          </div>
          <button
            type="button"
            aria-label="Sluiten"
            className="btn-ghost -mr-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-md max-lg:h-11 max-lg:w-11"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-5 text-sm">
          <div className="rounded-lg bg-[var(--bg-subtle)] p-3 text-xs leading-relaxed text-[var(--text-muted)]">
            <p>
              Zet in je tekst tijdelijke citaten zoals{" "}
              <code className="rounded bg-[var(--bg-panel)] px-1 py-0.5 font-mono text-[var(--text)]">
                {"{Meyhoff 2022 #3fa9c1e2}"}
              </code>
              . Je kopieert ze via rechtsklik op een artikel → <strong>Tijdelijk citaat kopiëren</strong> (ook
              voor meerdere tegelijk). Een DOI mag ook:{" "}
              <code className="font-mono">{"{doi:10.1056/NEJMoa2202707}"}</code>.
            </p>
          </div>
          <label className="block space-y-1.5">
            <span className="font-medium">Document (.docx)</span>
            <input
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setReport(null);
              }}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[var(--bg-subtle)] file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="font-medium">Stijl</span>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value as CslStyleId)}
                className="input w-full rounded-lg px-2.5 py-2"
              >
                {CSL_STYLE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {CSL_STYLES[id].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="font-medium">Kop literatuurlijst</span>
              <input
                value={heading}
                onChange={(e) => setHeading(e.target.value)}
                className="input w-full rounded-lg px-2.5 py-2"
              />
            </label>
          </div>
          {report && (
            <div className="rounded-lg border border-[var(--border)] p-3" role="status">
              <p className="flex items-center gap-2 font-medium">
                <FileText className="h-4 w-4 text-[var(--success)]" />
                Klaar ({report.style}): {report.citations} citaten, {report.references} bronnen
              </p>
              {report.unresolved.length > 0 && (
                <div className="mt-2 text-xs text-[var(--danger)]">
                  <p>Niet herkend en ongewijzigd gelaten:</p>
                  <ul className="mt-1 list-inside list-disc font-mono">
                    {report.unresolved.slice(0, 10).map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
              {report.mergedRuns > 0 && (
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Bij {report.mergedRuns} citaten stond de opmaak midden in het citaat; daar is één opmaak aangehouden.
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--bg-subtle)] px-5 py-3 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            className="btn-secondary rounded-lg px-3.5 py-2 text-sm max-lg:min-h-11"
            onClick={onClose}
          >
            {report ? "Sluiten" : "Annuleren"}
          </button>
          <button
            type="button"
            disabled={!file || busy}
            className="btn-primary inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm max-lg:min-h-11"
            onClick={() => void run()}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Opmaken…" : "Opmaken en downloaden"}
          </button>
        </div>
      </div>
    </div>
  );
}
