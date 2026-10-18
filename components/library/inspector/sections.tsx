"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Braces,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  MoreHorizontal,
  NotebookPen,
  Plus,
  RefreshCw,
  Share2,
  Trash2,
  Upload,
} from "lucide-react";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { FindPdfPanel } from "./FindPdf";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/api/client";
import { cleanDoiForLookup } from "@/lib/doi/normalize";
import {
  useAttachmentActions,
  useAttachments,
  useHighlightActions,
  useHighlights,
  usePatchReference,
  useReplaceReference,
} from "@/lib/library/hooks";
import { HIGHLIGHT_COLORS, type HighlightColor } from "../PdfViewer";
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

/** Markeringen van de getoonde bijlage; klik springt naar de pagina in de PDF. */
export function HighlightsSection({
  referenceId,
  attachmentId,
  onJump,
}: {
  referenceId: string;
  attachmentId: string;
  onJump: (attachmentId: string, page: number) => void;
}) {
  const toast = useToast();
  const { data: highlights = [] } = useHighlights(attachmentId);
  const { remove } = useHighlightActions(attachmentId);
  const sorted = [...highlights].sort((a, b) => a.page - b.page || (a.rects[0]?.y ?? 0) - (b.rects[0]?.y ?? 0));

  /** Alle markeringen als citaten onder de notitie zetten. */
  async function toNotes() {
    const current = await api<{ note?: { body: string } | null }>(`/api/references/${referenceId}/notes`);
    if (!current.ok) {
      toast.error("Notitie ophalen mislukt", current.error);
      return;
    }
    const quotes = sorted
      .filter((h) => h.quote?.trim())
      .map((h) => `> ${h.quote!.trim()} (p. ${h.page})`)
      .join("\n\n");
    const before = current.data.note?.body?.trim() ?? "";
    const body = [before, `### Markeringen\n\n${quotes}`].filter(Boolean).join("\n\n");
    const res = await api(`/api/references/${referenceId}/notes`, { method: "POST", body: { body } });
    if (!res.ok) toast.error("Notitie niet opgeslagen", res.error);
    else toast.success(`${sorted.length} markeringen naar de notities gezet`);
  }

  return (
    <DetailSection title="Markeringen">
      {sorted.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          Selecteer tekst in de PDF en kies een kleur om te markeren.
        </p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {sorted.map((h) => (
              <li key={h.id} className="group flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => onJump(attachmentId, h.page)}
                  className="flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)]"
                  title="Naar deze plek in de PDF"
                >
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: HIGHLIGHT_COLORS[(h.color as HighlightColor) in HIGHLIGHT_COLORS ? (h.color as HighlightColor) : "yellow"].dot }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 break-words">
                    <span className="mr-1.5 text-xs font-medium text-[var(--text-subtle)] tabular-nums">p. {h.page}</span>
                    {h.quote || <em className="text-[var(--text-subtle)]">(zonder tekst)</em>}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Markering verwijderen"
                  onClick={() => remove.mutate(h.id)}
                  className="btn-ghost btn-danger mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md lg:opacity-0 lg:group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void toNotes()}
            className="btn-secondary mt-3 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs max-lg:min-h-10"
          >
            <NotebookPen className="h-3.5 w-3.5" /> Naar notities
          </button>
        </>
      )}
    </DetailSection>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Alle bijlagen van een artikel: hoofd-PDF en supplementen. */
export function AttachmentSection({
  reference,
  onReplace,
  onOpen,
}: {
  reference: ReferenceRecord;
  onReplace: () => void;
  onOpen: (attachmentId: string) => void;
}) {
  const toast = useToast();
  const { data: attachments = [], isPending } = useAttachments(reference.hasPdf ? reference.id : null);
  const actions = useAttachmentActions(reference.id);
  const addRef = useRef<HTMLInputElement>(null);

  async function addFile(file: File) {
    const label = await toast.prompt({
      title: "Bijlage toevoegen",
      label: "Omschrijving (optioneel)",
      placeholder: "Bijv. Supplement, Protocol, Editorial",
      initial: file.name.replace(/\.pdf$/i, ""),
      confirmLabel: "Toevoegen",
    });
    if (label === null) return;
    actions.add.mutate(
      { file, label },
      {
        onError: (error) => toast.error("Toevoegen mislukt", error.message),
        onSuccess: () => toast.success("Bijlage toegevoegd", "De tekst wordt doorzoekbaar gemaakt."),
      },
    );
  }

  async function rename(id: string, current: string | null) {
    const label = await toast.prompt({ title: "Omschrijving", label: "Omschrijving", initial: current ?? "" });
    if (label === null) return;
    actions.update.mutate({ id, label }, { onError: (error) => toast.error("Opslaan mislukt", error.message) });
  }

  async function remove(id: string, name: string) {
    const ok = await toast.confirm({
      title: "Bijlage verwijderen?",
      description: `"${name}" en de markeringen erin worden verwijderd.`,
      confirmLabel: "Verwijderen",
      danger: true,
    });
    if (!ok) return;
    actions.remove.mutate(id, {
      onError: (error) => toast.error("Verwijderen mislukt", error.message),
      onSuccess: () => toast.success("Bijlage verwijderd"),
    });
  }

  return (
    <DetailSection title="Bijlagen">
      <input
        ref={addRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void addFile(f);
        }}
      />
      {!reference.hasPdf ? (
        <FindPdfPanel reference={reference} onUpload={onReplace} />
      ) : isPending ? (
        <p className="text-sm text-[var(--text-muted)]">Laden…</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {attachments.map((a, index) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--bg-subtle)] text-[var(--text-muted)]">
                <FileText className="h-4 w-4" />
              </span>
              <button type="button" onClick={() => onOpen(a.id)} className="min-w-0 flex-1 text-left" title="Openen">
                <p className="truncate text-sm font-medium">
                  {index === 0 ? "Hoofd-PDF" : a.label || a.name}
                  {index === 0 && a.label ? ` · ${a.label}` : ""}
                </p>
                <p className="truncate text-xs text-[var(--text-muted)]">
                  {[a.pageCount && `${a.pageCount} p.`, formatSize(a.sizeBytes), a.indexed ? "doorzoekbaar" : "tekst wordt verwerkt…"]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </button>
              <a
                href={`/api/attachments/${a.id}?download=1`}
                className="btn-ghost grid h-8 w-8 shrink-0 place-items-center rounded-md"
                title="Downloaden"
                aria-label="Downloaden"
              >
                <Download className="h-4 w-4" />
              </a>
              <AttachmentMenu
                primary={index === 0}
                onRename={() => void rename(a.id, a.label)}
                onMakePrimary={() => actions.update.mutate({ id: a.id, makePrimary: true })}
                onRemove={() => void remove(a.id, index === 0 ? "Hoofd-PDF" : a.label || a.name)}
              />
            </li>
          ))}
        </ul>
      )}
      <div className={cn("mt-3 flex flex-wrap gap-2", !reference.hasPdf && "hidden")}>
        <button
          type="button"
          className="btn-secondary inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs max-lg:min-h-10"
          onClick={onReplace}
        >
          <Upload className="h-3.5 w-3.5" />
          Hoofd-PDF vervangen
        </button>
        {reference.hasPdf && (
          <button
            type="button"
            disabled={actions.add.isPending}
            className="btn-secondary inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs max-lg:min-h-10"
            onClick={() => addRef.current?.click()}
          >
            <Plus className="h-3.5 w-3.5" />
            {actions.add.isPending ? "Toevoegen…" : "Bijlage toevoegen"}
          </button>
        )}
      </div>
    </DetailSection>
  );
}

function AttachmentMenu({
  primary,
  onRename,
  onMakePrimary,
  onRemove,
}: {
  primary: boolean;
  onRename: () => void;
  onMakePrimary: () => void;
  onRemove: () => void;
}) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <button
        type="button"
        aria-label="Opties"
        className="btn-ghost grid h-8 w-8 shrink-0 place-items-center rounded-md"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ x: r.left - 160, y: r.bottom + 4 });
        }}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {at && (
        <ContextMenu
          x={at.x}
          y={at.y}
          onClose={() => setAt(null)}
          entries={[
            { label: "Omschrijving wijzigen", onSelect: onRename },
            { label: "Als hoofd-PDF instellen", onSelect: onMakePrimary, disabled: primary },
            { kind: "separator" },
            { label: "Bijlage verwijderen", onSelect: onRemove, danger: true },
          ]}
        />
      )}
    </>
  )
}
