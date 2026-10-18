"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Braces, Check, Copy, ExternalLink, FileText, Plus, RefreshCw, Share2, Upload } from "lucide-react";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/api/client";
import { cleanDoiForLookup } from "@/lib/doi/normalize";
import {
  useAddHighlight,
  useHighlights,
  usePatchReference,
  useReplaceReference,
} from "@/lib/library/hooks";
import type { ReferenceRecord } from "@/lib/references/types";
import { cn } from "@/lib/utils";
import { DetailSection } from "../shared";
import { CSL_STYLES, CSL_STYLE_IDS } from "@/lib/cite/styles";
import { useCiteStyle, type CiteStyleId } from "./useCitationCopy";
import type { ExportMode } from "./useExport";

export function CiteSection({
  reference,
  citeCopied,
  exporting,
  onCopy,
  onExport,
}: {
  reference: ReferenceRecord;
  citeCopied: string | null;
  exporting: boolean;
  onCopy: (style: CiteStyleId) => void;
  onExport: (mode: ExportMode) => void;
}) {
  const [style, setStyle] = useCiteStyle();
  // Voorbeeld in de gekozen stijl; opnieuw ophalen als het artikel wijzigt.
  const preview = useQuery({
    queryKey: ["cite", reference.id, style, reference.updatedAt],
    queryFn: async () => {
      const res = await api<{ citation: string }>(`/api/cite/${reference.id}?style=${style}`);
      if (!res.ok) throw new Error(res.error);
      return res.data.citation;
    },
    staleTime: Infinity,
  });

  return (
    <DetailSection title="Citeren">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          value={style}
          onChange={(e) => setStyle(e.target.value as CiteStyleId)}
          aria-label="Citeerstijl"
          className="input rounded-lg px-2.5 py-1.5 text-xs font-medium max-lg:min-h-11"
        >
          {CSL_STYLE_IDS.map((id) => (
            <option key={id} value={id}>
              {CSL_STYLES[id].label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium max-lg:min-h-11",
            citeCopied ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "btn-primary",
          )}
          onClick={() => onCopy(style)}
          title="Opgemaakt kopiëren (c)"
        >
          {citeCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          Kopiëren
        </button>
        <button
          type="button"
          disabled={exporting}
          className="btn-secondary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs max-lg:min-h-11"
          onClick={() => onExport("bibtex")}
          title="BibTeX delen of kopiëren"
        >
          <Braces className="h-3.5 w-3.5 opacity-60" />
          BibTeX
        </button>
        <button
          type="button"
          disabled={exporting}
          className="btn-secondary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs max-lg:min-h-11"
          onClick={() => onExport(reference.hasPdf ? "pdf" : "summary")}
          title={reference.hasPdf ? "PDF delen (WhatsApp, Bestanden, …)" : "Artikelinfo delen"}
        >
          <Share2 className="h-3.5 w-3.5 opacity-60" />
          {exporting ? "Bezig…" : reference.hasPdf ? "PDF delen" : "Delen"}
        </button>
      </div>
      <p
        className="mt-3 rounded-lg bg-[var(--bg-subtle)] px-3 py-2.5 font-serif text-[0.875rem] leading-relaxed text-[var(--text)] select-text"
        aria-live="polite"
      >
        {preview.isPending ? (
          <span className="text-[var(--text-subtle)]">Opmaken…</span>
        ) : preview.isError ? (
          <span className="text-[var(--danger)]">Kon niet opmaken in deze stijl.</span>
        ) : (
          preview.data
        )}
      </p>
      <p
        className={cn(
          "mt-2 text-xs",
          citeCopied ? "font-medium text-[var(--success)]" : "text-[var(--text-subtle)]",
        )}
        role="status"
      >
        {citeCopied ?? "Kopiëren neemt de opmaak mee (cursief, nummering) voor Word en Pages."}
      </p>
    </DetailSection>
  );
}

/** Gegevens met bewerkbare DOI. Gebruik `key={reference.id}` zodat het DOI-veld per artikel opnieuw begint. */
export function MetadataSection({ reference }: { reference: ReferenceRecord }) {
  const toast = useToast();
  const patch = usePatchReference();
  const replaceReference = useReplaceReference();
  const [doiEdit, setDoiEdit] = useState(reference.doi ?? "");
  const [refreshing, setRefreshing] = useState(false);

  async function saveDoi() {
    try {
      const item = await patch.mutateAsync({
        id: reference.id,
        patch: { doi: doiEdit.trim() || null },
      });
      setDoiEdit(item.doi ?? "");
      toast.success("DOI opgeslagen");
    } catch (error) {
      toast.error("DOI opslaan mislukt", error instanceof Error ? error.message : undefined);
    }
  }

  async function refreshMetadata() {
    setRefreshing(true);
    const res = await api<{ item?: ReferenceRecord }>(
      `/api/references/${reference.id}/refresh-metadata`,
      {
        method: "POST",
        body: doiEdit.trim() ? { doi: cleanDoiForLookup(doiEdit.trim()) } : {},
      },
    );
    setRefreshing(false);
    if (!res.ok) {
      toast.error("Metadata ophalen mislukt", res.error);
      return;
    }
    if (res.data.item) {
      replaceReference(res.data.item);
      setDoiEdit(res.data.item.doi ?? "");
    }
    toast.success("Metadata bijgewerkt");
  }

  return (
    <DetailSection title="Gegevens">
      <dl className="grid grid-cols-[6.5rem_1fr] gap-x-4 gap-y-3 text-sm max-sm:grid-cols-1 max-sm:gap-y-1">
        <dt className="pt-2 text-[var(--text-muted)] max-sm:pt-0">DOI</dt>
        <dd className="min-w-0 space-y-2 max-sm:mb-2">
          <input
            type="text"
            className="input w-full min-w-0 max-w-full rounded-lg px-3 py-1.5 font-mono text-[0.8125rem]"
            placeholder="10.1038/…"
            value={doiEdit}
            onChange={(e) => setDoiEdit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveDoi();
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-primary rounded-md px-2.5 py-1 text-xs max-lg:min-h-10"
              disabled={patch.isPending || doiEdit.trim() === (reference.doi ?? "")}
              onClick={() => void saveDoi()}
            >
              {patch.isPending ? "Opslaan…" : "Opslaan"}
            </button>
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs max-lg:min-h-10"
              disabled={refreshing || !doiEdit.trim()}
              onClick={() => void refreshMetadata()}
              title="Titel, abstract en open PDF via de DOI"
            >
              <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
              {refreshing ? "Ophalen…" : "Metadata ophalen"}
            </button>
            {reference.doi && (
              <a
                className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
                href={`https://doi.org/${cleanDoiForLookup(reference.doi)}`}
                target="_blank"
                rel="noreferrer"
              >
                Openen op doi.org <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </dd>
        {reference.journal && (
          <>
            <dt className="text-[var(--text-muted)]">Tijdschrift</dt>
            <dd className="max-sm:mb-2">{reference.journal}</dd>
          </>
        )}
        {reference.year && (
          <>
            <dt className="text-[var(--text-muted)]">Jaar</dt>
            <dd className="tabular-nums max-sm:mb-2">{reference.year}</dd>
          </>
        )}
        {(reference.volume || reference.issue || reference.pages) && (
          <>
            <dt className="text-[var(--text-muted)]">Uitgave</dt>
            <dd className="tabular-nums max-sm:mb-2">
              {[
                reference.volume && `Jaargang ${reference.volume}`,
                reference.issue && `nr. ${reference.issue}`,
                reference.pages && `p. ${reference.pages}`,
              ]
                .filter(Boolean)
                .join(", ")}
            </dd>
          </>
        )}
      </dl>
    </DetailSection>
  );
}

export function AbstractSection({ abstract }: { abstract: string | null }) {
  return (
    <DetailSection title="Abstract">
      {abstract ? (
        <p className="font-serif text-[0.9375rem] leading-relaxed text-[var(--text)] [overflow-wrap:anywhere]">
          {abstract}
        </p>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">
          Nog geen abstract. Gebruik &quot;Metadata ophalen&quot; bij een geldige DOI.
        </p>
      )}
    </DetailSection>
  );
}

export function HighlightsSection({ attachmentId }: { attachmentId: string }) {
  const toast = useToast();
  const { data: highlights = [] } = useHighlights(attachmentId);
  const addHighlight = useAddHighlight();
  const [page, setPage] = useState("1");
  const [quote, setQuote] = useState("");

  async function add() {
    if (!quote.trim()) return;
    try {
      await addHighlight.mutateAsync({ attachmentId, page: Number(page) || 1, quote: quote.trim() });
      setQuote("");
    } catch (error) {
      toast.error("Highlight niet opgeslagen", error instanceof Error ? error.message : undefined);
    }
  }

  return (
    <DetailSection title="Highlights">
      <div className="flex min-w-0 gap-2">
        <input
          className="input w-16 shrink-0 rounded-lg px-2 py-1.5 text-center text-sm tabular-nums"
          value={page}
          onChange={(e) => setPage(e.target.value)}
          placeholder="Pag."
          aria-label="Pagina"
        />
        <input
          className="input min-w-0 flex-1 rounded-lg px-3 py-1.5 text-sm"
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          placeholder="Geciteerde tekst…"
          aria-label="Geciteerde tekst"
        />
        <button
          type="button"
          className="btn-secondary grid w-9 shrink-0 place-items-center rounded-lg"
          aria-label="Highlight toevoegen"
          disabled={!quote.trim() || addHighlight.isPending}
          onClick={() => void add()}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {highlights.length > 0 && (
        <ul className="mt-3 space-y-2">
          {highlights.map((h) => (
            <li
              key={h.id}
              className="rounded-r-md border-l-2 border-[var(--star)] bg-[var(--bg-subtle)] py-1.5 pr-3 pl-3 text-sm break-words"
            >
              <span className="mr-2 text-xs font-medium text-[var(--text-subtle)] tabular-nums">
                p. {h.page}
              </span>
              {h.quote}
            </li>
          ))}
        </ul>
      )}
    </DetailSection>
  );
}

export function AttachmentSection({
  hasPdf,
  onUpload,
}: {
  hasPdf: boolean;
  onUpload: () => void;
}) {
  return (
    <DetailSection title="Bijlage">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--bg-subtle)] text-[var(--text-muted)]">
          <FileText className="h-4 w-4" />
        </span>
        <p className="min-w-0 flex-1 text-sm text-[var(--text-muted)]">
          {hasPdf ? "PDF gekoppeld" : "Nog geen PDF gekoppeld"}
        </p>
        <button
          type="button"
          className="btn-secondary inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs max-lg:min-h-10"
          onClick={onUpload}
        >
          <Upload className="h-3.5 w-3.5" />
          {hasPdf ? "PDF vervangen" : "PDF uploaden"}
        </button>
      </div>
    </DetailSection>
  );
}
