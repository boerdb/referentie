"use client";

import { useRef, useState } from "react";
import { BookOpen, ChevronLeft, FileText, RotateCcw, Share2, Star, Trash2, Upload } from "lucide-react";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/api/client";
import { usePatchReference, useReplaceReference } from "@/lib/library/hooks";
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
import { DetailSection, IconButton, StatusSegments, authorList } from "./shared";

type Props = {
  reference: ReferenceRecord | null;
  /** Op de telefoon: inspector verborgen zolang de lijst getoond wordt. */
  hidden: boolean;
  onBack: () => void;
  onSelect: (id: string) => void;
  onLibraryChanged: () => void;
  onTrash: (reference: ReferenceRecord) => void;
  onRestore: (reference: ReferenceRecord) => void;
  onPurge: (reference: ReferenceRecord) => void;
  /** Gedeeld met LibraryApp, zodat sneltoets en palet dezelfde melding geven. */
  citation: ReturnType<typeof useCitationCopy>;
  exporter: ReturnType<typeof useExport>;
};

export function Inspector({
  reference,
  hidden,
  onBack,
  onSelect,
  onLibraryChanged,
  onTrash,
  onRestore,
  onPurge,
  citation,
  exporter,
}: Props) {
  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-x-hidden",
        hidden ? "hidden lg:flex" : "flex w-full",
      )}
    >
      {reference ? (
        <ReferenceDetail
          key={reference.id}
          reference={reference}
          onBack={onBack}
          onSelect={onSelect}
          onLibraryChanged={onLibraryChanged}
          onTrash={onTrash}
          onRestore={onRestore}
          onPurge={onPurge}
          citation={citation}
          exporter={exporter}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--bg-panel)] text-[var(--text-subtle)] ring-1 ring-[var(--border)]">
            <BookOpen className="h-5 w-5" />
          </span>
          <p className="mt-4 text-sm font-medium">Geen artikel geselecteerd</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Kies een artikel uit de lijst, of gebruik <span className="kbd">j</span>{" "}
            <span className="kbd">k</span> om te navigeren.
          </p>
        </div>
      )}
    </section>
  );
}

/** Per artikel een eigen instantie (key), zodat lokale state vanzelf opnieuw begint. */
function ReferenceDetail({
  reference,
  onBack,
  onSelect,
  onLibraryChanged,
  onTrash,
  onRestore,
  onPurge,
  citation,
  exporter,
}: Omit<Props, "reference" | "hidden"> & { reference: ReferenceRecord }) {
  const toast = useToast();
  const patch = usePatchReference();
  const replaceReference = useReplaceReference();
  const { citeCopied, copyCitation } = citation;
  const { exporting, exportReference } = exporter;
  const fileRef = useRef<HTMLInputElement>(null);
  const [mobileTab, setMobileTab] = useState<"info" | "pdf">("info");
  const [titleExpanded, setTitleExpanded] = useState(false);
  const inTrash = reference.deletedAt !== null;

  function update(fields: { starred?: boolean; status?: RefStatus }) {
    patch.mutate(
      { id: reference.id, patch: fields },
      {
        onError: (error) => toast.error("Wijziging niet opgeslagen", error.message),
      },
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
  const shareLabel = reference.hasPdf ? "PDF exporteren / delen" : "Artikelinfo exporteren / delen";

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
      <IconButton
        label={shareLabel}
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
      <div className="flex min-w-0 flex-col overflow-hidden border-b border-[var(--border)] lg:hidden">
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
              titleExpanded
                ? "text-[0.95rem]"
                : mobileTab === "pdf"
                  ? "line-clamp-1 text-sm"
                  : "line-clamp-3 text-[0.95rem]",
            )}
          >
            {reference.title}
          </h1>
          <p
            className={cn(
              "mt-0.5 break-words text-xs text-[var(--text-muted)]",
              !titleExpanded && (mobileTab === "pdf" ? "hidden" : "line-clamp-1"),
            )}
          >
            {authorList(reference.authors)}
          </p>
        </button>
        {!inTrash && (
          <StatusSegments status={reference.status} onChange={(status) => update({ status })} />
        )}
        {reference.hasPdf && (
          <div
            className="mx-3 mb-2 grid grid-cols-2 gap-1 rounded-lg bg-[var(--bg-subtle)] p-1"
            role="tablist"
            aria-label="Artikelweergave"
          >
            {(["info", "pdf"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={mobileTab === tab}
                className={cn(
                  "rounded-md py-2 text-sm font-medium",
                  mobileTab === tab
                    ? "bg-[var(--bg-panel)] text-[var(--text)] shadow-sm ring-1 ring-[var(--border)]"
                    : "text-[var(--text-muted)]",
                )}
                onClick={() => setMobileTab(tab)}
              >
                {tab === "info" ? "Artikel" : "PDF"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Desktop */}
      <header className="hidden border-b border-[var(--border)] bg-[var(--bg-panel)] px-6 pt-5 pb-4 lg:block">
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-muted)]">
            {[reference.journal, reference.year].filter(Boolean).join(" · ") || "Artikel"}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            {!inTrash && (
              <StatusSegments
                compact
                status={reference.status}
                onChange={(status) => update({ status })}
              />
            )}
            {actions}
          </div>
        </div>
        <h1 className="mt-2 font-serif text-[1.375rem] leading-tight font-semibold tracking-[-0.01em] text-balance">
          {reference.title}
        </h1>
        {reference.authors.length > 0 && (
          <p className="mt-2 text-sm text-[var(--text-muted)]">{authorList(reference.authors)}</p>
        )}
      </header>

      {inTrash && (
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] bg-[var(--danger-soft)] px-4 py-2.5 text-sm lg:px-6">
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

      <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-2 lg:grid-rows-1">
        <div
          className={cn(
            "min-h-0 min-w-0 w-full max-w-full overflow-x-hidden overflow-y-auto overscroll-y-contain border-b border-[var(--border)] bg-[var(--bg-panel)] [overflow-wrap:anywhere] lg:border-r lg:border-b-0",
            reference.hasPdf && mobileTab === "pdf" ? "hidden lg:block" : "block flex-1",
          )}
        >
          <div className="divide-y divide-[var(--border)]">
            <CiteSection
              reference={reference}
              citeCopied={citeCopied}
              exporting={exporting}
              onCopy={(style) => void copyCitation(reference.id, style)}
              onExport={(mode) => void exportReference(reference, mode)}
            />
            <MetadataSection reference={reference} />
            <AbstractSection abstract={reference.abstract} />
            <DetailSection title="Kruisverwijzingen">
              <CitationPanel
                referenceId={reference.id}
                doi={reference.doi}
                onOpenInLibrary={onSelect}
                onAdded={onLibraryChanged}
              />
            </DetailSection>
            <NotesSection referenceId={reference.id} />
            {reference.attachmentId && <HighlightsSection attachmentId={reference.attachmentId} />}
            <AttachmentSection hasPdf={reference.hasPdf} onUpload={() => fileRef.current?.click()} />
          </div>
        </div>

        <div
          className={cn(
            "min-h-0 min-w-0 flex-col lg:flex lg:min-h-0 lg:p-4",
            reference.hasPdf && mobileTab === "pdf" ? "flex flex-1 p-2" : "hidden lg:flex",
          )}
        >
          {reference.hasPdf ? (
            <PdfViewer url={`/api/references/${reference.id}/pdf`} title={reference.title} />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] p-6 text-center">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--bg-panel)] text-[var(--text-subtle)] ring-1 ring-[var(--border)]">
                <FileText className="h-5 w-5" />
              </span>
              <p className="mt-4 text-sm font-medium">Geen PDF gekoppeld</p>
              <p className="mt-1 max-w-xs text-sm text-[var(--text-muted)]">
                Upload een PDF bij dit artikel. Een PDF die je op de bibliotheek sleept wordt een
                nieuw artikel met metadata via DOI.
              </p>
              <button
                type="button"
                className="btn-secondary mt-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-4 w-4" /> PDF uploaden
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
