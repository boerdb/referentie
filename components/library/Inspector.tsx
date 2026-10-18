"use client";

import { useRef, useState } from "react";
import {
  BookOpen,
  BookOpenText,
  Braces,
  ChevronLeft,
  RotateCcw,
  Share2,
  Star,
  StarOff,
  Trash2,
} from "lucide-react";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/api/client";
import { usePatchReference, useReplaceReference } from "@/lib/library/hooks";
import { usePref } from "@/lib/library/prefs";
import type { ReferenceRecord, RefStatus } from "@/lib/references/types";
import { cn } from "@/lib/utils";
import { CitationPanel } from "./CitationPanel";
import { PdfViewer } from "./PdfViewer";
import { NotesSection } from "./inspector/NotesSection";
import {
  AbstractSection,
  AttachmentSection,
  CiteSection,
  HighlightsSection,
  MetadataSection,
} from "./inspector/sections";
import type { useCitationCopy } from "./inspector/useCitationCopy";
import type { useExport } from "./inspector/useExport";
import { DetailSection, IconButton, STATUSES, STATUS_LABEL, StatusSegments, authorList } from "./shared";

type Tab = "info" | "abstract" | "notes" | "files" | "links" | "pdf";

const TAB_LABEL: Record<Tab, string> = {
  info: "Info",
  abstract: "Abstract",
  notes: "Notities",
  files: "Bijlagen",
  links: "Verwijzingen",
  pdf: "PDF",
};

type Props = {
  reference: ReferenceRecord | null;
  /** Meer dan één artikel geselecteerd: toon het bulkpaneel. */
  selection: ReferenceRecord[];
  /** Op de telefoon: inspector verborgen zolang de lijst getoond wordt. */
  hidden: boolean;
  pdfOpen: boolean;
  onBack: () => void;
  onSelect: (id: string) => void;
  onLibraryChanged: () => void;
  onTrash: (reference: ReferenceRecord) => void;
  onRestore: (reference: ReferenceRecord) => void;
  onPurge: (reference: ReferenceRecord) => void;
  onTogglePdf: () => void;
  onBulk: (action: BulkRequest) => void;
  /** Gedeeld met LibraryApp, zodat sneltoets en palet dezelfde melding geven. */
  citation: ReturnType<typeof useCitationCopy>;
  exporter: ReturnType<typeof useExport>;
};

export type BulkRequest =
  | { kind: "status"; status: RefStatus }
  | { kind: "starred"; starred: boolean }
  | { kind: "bibtex" }
  | { kind: "trash" }
  | { kind: "restore" }
  | { kind: "purge" };

export function Inspector(props: Props) {
  const { reference, selection, hidden } = props;
  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-x-hidden bg-[var(--bg-panel)]",
        hidden ? "hidden lg:flex" : "flex w-full",
      )}
    >
      {selection.length > 1 ? (
        <BulkPanel selection={selection} onBulk={props.onBulk} />
      ) : reference ? (
        <ReferenceDetail key={reference.id} {...props} reference={reference} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--bg-subtle)] text-[var(--text-subtle)] ring-1 ring-[var(--border)]">
            <BookOpen className="h-5 w-5" />
          </span>
          <p className="mt-4 text-sm font-medium">Geen artikel geselecteerd</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Kies een artikel uit de lijst, of gebruik <span className="kbd">↑</span>{" "}
            <span className="kbd">↓</span> om te navigeren.
          </p>
        </div>
      )}
    </section>
  );
}

/** Per artikel een eigen instantie (key), zodat lokale state vanzelf opnieuw begint. */
function ReferenceDetail({
  reference,
  pdfOpen,
  onBack,
  onSelect,
  onLibraryChanged,
  onTrash,
  onRestore,
  onPurge,
  onTogglePdf,
  citation,
  exporter,
}: Props & { reference: ReferenceRecord }) {
  const toast = useToast();
  const patch = usePatchReference();
  const replaceReference = useReplaceReference();
  const { citeCopied, copyCitation } = citation;
  const { exporting, exportReference } = exporter;
  const fileRef = useRef<HTMLInputElement>(null);
  const [savedTab, setSavedTab] = usePref<Tab>("inspectorTab", "info");
  // De PDF-tab bestaat alleen op de telefoon; op desktop opent de PDF naast de inspector.
  const [mobilePdf, setMobilePdf] = useState(false);
  const [titleExpanded, setTitleExpanded] = useState(false);
  const inTrash = reference.deletedAt !== null;
  const tab: Tab = mobilePdf ? "pdf" : savedTab === "pdf" ? "info" : savedTab;
  const tabs: Tab[] = ["info", "abstract", "notes", "files", "links"];

  function selectTab(next: Tab) {
    setMobilePdf(next === "pdf");
    if (next !== "pdf") setSavedTab(next);
  }

  function update(fields: { starred?: boolean; status?: RefStatus }) {
    patch.mutate(
      { id: reference.id, patch: fields },
      { onError: (error) => toast.error("Wijziging niet opgeslagen", error.message) },
    );
  }

  async function uploadPdf(file: File) {
    const fd = new FormData();
    fd.set("file", file);
    const res = await api<{ item?: ReferenceRecord }>(`/api/references/${reference.id}/pdf`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      toast.error("Upload mislukt", res.error);
      return;
    }
    if (res.data.item) replaceReference(res.data.item);
    onLibraryChanged();
    toast.success("PDF gekoppeld");
  }

  const shareMode = reference.hasPdf ? "pdf" : "summary";

  const actions = inTrash ? (
    <>
      <IconButton label="Terugzetten" onClick={() => onRestore(reference)} className="max-lg:h-11 max-lg:w-11">
        <RotateCcw className="h-4 w-4" />
      </IconButton>
      <IconButton
        label="Definitief verwijderen"
        onClick={() => onPurge(reference)}
        className="btn-danger max-lg:h-11 max-lg:w-11"
      >
        <Trash2 className="h-4 w-4" />
      </IconButton>
    </>
  ) : (
    <>
      <IconButton
        label={reference.starred ? "Uit favorieten" : "Aan favorieten toevoegen"}
        onClick={() => update({ starred: !reference.starred })}
        className="max-lg:h-11 max-lg:w-11"
      >
        <Star className={cn("h-4 w-4", reference.starred && "fill-[var(--star)] text-[var(--star)]")} />
      </IconButton>
      {reference.hasPdf && (
        <IconButton
          label={pdfOpen ? "PDF sluiten" : "PDF lezen"}
          onClick={onTogglePdf}
          className={cn("max-lg:hidden", pdfOpen && "bg-[var(--bg-hover)] text-[var(--text)]")}
        >
          <BookOpenText className="h-4 w-4" />
        </IconButton>
      )}
      <IconButton
        label={reference.hasPdf ? "PDF exporteren / delen" : "Artikelinfo exporteren / delen"}
        disabled={exporting}
        onClick={() => void exportReference(reference, shareMode)}
        className="max-lg:h-11 max-lg:w-11"
      >
        <Share2 className="h-4 w-4" />
      </IconButton>
      <IconButton
        label="Naar de prullenbak"
        onClick={() => onTrash(reference)}
        className="btn-danger max-lg:h-11 max-lg:w-11"
      >
        <Trash2 className="h-4 w-4" />
      </IconButton>
    </>
  );

  const tabBar = (withPdf: boolean) => (
    <div
      role="tablist"
      aria-label="Artikelgegevens"
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--border)] px-3 lg:px-4"
    >
      {[...tabs, ...(withPdf ? (["pdf"] as Tab[]) : [])].map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={tab === t}
          onClick={() => selectTab(t)}
          className={cn(
            "-mb-px shrink-0 border-b-2 px-2 py-2 text-xs font-medium whitespace-nowrap max-lg:py-2.5 max-lg:text-sm",
            tab === t
              ? "border-[var(--accent)] text-[var(--text)]"
              : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]",
          )}
        >
          {TAB_LABEL[t]}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void uploadPdf(f);
        }}
      />

      {/* Telefoon */}
      <div className="flex min-w-0 flex-col overflow-hidden lg:hidden">
        <div className="flex min-w-0 items-center gap-1 px-1 py-1">
          <button
            type="button"
            className="btn-ghost inline-flex h-11 shrink-0 items-center gap-1 rounded-lg pr-2.5 pl-1.5 text-sm font-medium"
            onClick={onBack}
          >
            <ChevronLeft className="h-5 w-5" /> Lijst
          </button>
          <div className="ml-auto flex shrink-0 items-center">{actions}</div>
        </div>
        <button
          type="button"
          className="min-w-0 px-4 pb-2 text-left"
          onClick={() => setTitleExpanded((v) => !v)}
        >
          <h1
            className={cn(
              "font-serif break-words font-semibold leading-snug",
              titleExpanded ? "text-[0.95rem]" : tab === "pdf" ? "line-clamp-1 text-sm" : "line-clamp-3 text-[0.95rem]",
            )}
          >
            {reference.title}
          </h1>
          <p
            className={cn(
              "mt-0.5 break-words text-xs text-[var(--text-muted)]",
              !titleExpanded && (tab === "pdf" ? "hidden" : "line-clamp-1"),
            )}
          >
            {authorList(reference.authors)}
          </p>
        </button>
        {!inTrash && tab !== "pdf" && (
          <StatusSegments status={reference.status} onChange={(status) => update({ status })} />
        )}
        {tabBar(reference.hasPdf)}
      </div>

      {/* Desktop */}
      <header className="hidden shrink-0 px-5 pt-4 pb-3 lg:block">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-muted)]">
            {[reference.journal, reference.year].filter(Boolean).join(" · ") || "Artikel"}
          </p>
          <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
        </div>
        <h1 className="mt-1.5 font-serif text-[1.1875rem] leading-snug font-semibold tracking-[-0.01em] text-balance">
          {reference.title}
        </h1>
        {reference.authors.length > 0 && (
          <p className="mt-1.5 line-clamp-2 text-[0.8125rem] text-[var(--text-muted)]">
            {authorList(reference.authors)}
          </p>
        )}
        {!inTrash && (
          <div className="mt-3 [&>div]:mx-0 [&>div]:mb-0">
            <StatusSegments status={reference.status} onChange={(status) => update({ status })} />
          </div>
        )}
      </header>
      <div className="hidden lg:block">{tabBar(false)}</div>

      {inTrash && (
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] bg-[var(--danger-soft)] px-4 py-2.5 text-sm lg:px-5">
          <Trash2 className="h-4 w-4 shrink-0 text-[var(--danger)]" />
          <p className="min-w-0 flex-1">Dit artikel staat in de prullenbak.</p>
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs max-lg:min-h-10"
            onClick={() => onRestore(reference)}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Terugzetten
          </button>
        </div>
      )}

      {tab === "pdf" ? (
        <div className="flex min-h-0 flex-1 flex-col p-2 lg:hidden">
          <PdfViewer url={`/api/references/${reference.id}/pdf`} title={reference.title} />
        </div>
      ) : (
        <div
          role="tabpanel"
          aria-label={TAB_LABEL[tab]}
          className="min-h-0 min-w-0 w-full flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain [overflow-wrap:anywhere] [&_section]:lg:px-5"
        >
          {tab === "info" && (
            <div className="divide-y divide-[var(--border)]">
              <CiteSection
                reference={reference}
                citeCopied={citeCopied}
                exporting={exporting}
                onCopy={(style) => void copyCitation(reference.id, style)}
                onExport={(mode) => void exportReference(reference, mode)}
              />
              <MetadataSection reference={reference} />
            </div>
          )}
          {tab === "abstract" && <AbstractSection abstract={reference.abstract} />}
          {tab === "notes" && <NotesSection referenceId={reference.id} />}
          {tab === "files" && (
            <div className="divide-y divide-[var(--border)]">
              <AttachmentSection hasPdf={reference.hasPdf} onUpload={() => fileRef.current?.click()} />
              {reference.attachmentId && <HighlightsSection attachmentId={reference.attachmentId} />}
            </div>
          )}
          {tab === "links" && (
            <DetailSection title="Kruisverwijzingen">
              <CitationPanel
                referenceId={reference.id}
                doi={reference.doi}
                onOpenInLibrary={onSelect}
                onAdded={onLibraryChanged}
              />
            </DetailSection>
          )}
        </div>
      )}
    </>
  );
}

function BulkPanel({
  selection,
  onBulk,
}: {
  selection: ReferenceRecord[];
  onBulk: (action: BulkRequest) => void;
}) {
  const inTrash = selection.every((r) => r.deletedAt !== null);
  const allStarred = selection.every((r) => r.starred);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-5">
      <p className="text-xs font-medium text-[var(--text-muted)]">Meervoudige selectie</p>
      <h2 className="mt-1 font-serif text-[1.1875rem] font-semibold">
        {selection.length} artikelen geselecteerd
      </h2>
      <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-[0.8125rem] text-[var(--text-muted)]">
        {selection.slice(0, 50).map((r) => (
          <li key={r.id} className="truncate">
            {r.title}
          </li>
        ))}
        {selection.length > 50 && <li>en nog {selection.length - 50}…</li>}
      </ul>

      {inTrash ? (
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm"
            onClick={() => onBulk({ kind: "restore" })}
          >
            <RotateCcw className="h-4 w-4" /> Terugzetten
          </button>
          <button
            type="button"
            className="btn-secondary btn-danger inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm"
            onClick={() => onBulk({ kind: "purge" })}
          >
            <Trash2 className="h-4 w-4" /> Definitief verwijderen
          </button>
        </div>
      ) : (
        <>
          <p className="section-label mt-6 mb-2">Leesstatus</p>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className="btn-secondary rounded-lg px-3 py-1.5 text-sm"
                onClick={() => onBulk({ kind: "status", status: s })}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <p className="section-label mt-5 mb-2">Acties</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm"
              onClick={() => onBulk({ kind: "starred", starred: !allStarred })}
            >
              {allStarred ? <StarOff className="h-4 w-4" /> : <Star className="h-4 w-4" />}
              {allStarred ? "Uit favorieten" : "Aan favorieten"}
            </button>
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm"
              onClick={() => onBulk({ kind: "bibtex" })}
            >
              <Braces className="h-4 w-4" /> BibTeX van selectie
            </button>
            <button
              type="button"
              className="btn-secondary btn-danger inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm"
              onClick={() => onBulk({ kind: "trash" })}
            >
              <Trash2 className="h-4 w-4" /> Naar de prullenbak
            </button>
          </div>
        </>
      )}
      <p className="mt-6 text-xs text-[var(--text-subtle)]">
        Tip: <span className="kbd">Shift</span>-klik selecteert een reeks,{" "}
        <span className="kbd">Ctrl</span>-klik voegt losse artikelen toe.
      </p>
    </div>
  );
}
