"use client";

import { useState } from "react";
import {
  Braces,
  Copy,
  Download,
  FileUp,
  Loader2,
  PenLine,
  Plus,
  Search,
  Share2,
  Upload,
  X,
} from "lucide-react";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/api/client";
import type { ReferenceRecord } from "@/lib/references/types";
import { cn } from "@/lib/utils";
import { PaletteAction, SheetOption } from "./shared";

export function CommandPalette({
  selected,
  importing,
  onClose,
  onImportDoi,
  onNew,
  onCopyApa,
  onExport,
  onImportFile,
  styleLabel,
}: {
  selected: ReferenceRecord | null;
  importing: boolean;
  onClose: () => void;
  onImportDoi: (doi: string) => void;
  onNew: () => void;
  onCopyApa: () => void;
  onExport: (mode: "pdf" | "summary" | "bibtex") => void;
  onImportFile: () => void;
  /** Naam van de gekozen citeerstijl. */
  styleLabel: string;
}) {
  const [query, setQuery] = useState("");

  function run(fn: () => void) {
    onClose();
    fn();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[15vh] max-lg:pt-[max(0.75rem,env(safe-area-inset-top))]"
      style={{ background: "var(--overlay)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] shadow-[var(--shadow-lg)]">
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4">
          <Search className="h-4 w-4 shrink-0 text-[var(--text-subtle)]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Plak een DOI of typ een opdracht…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-[var(--text-subtle)] max-lg:text-base"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && query.trim()) onImportDoi(query.trim());
            }}
          />
          <span className="kbd hidden shrink-0 lg:inline-flex">Esc</span>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-1.5 text-sm">
          <p className="section-label px-2.5 pt-2 pb-1">Toevoegen</p>
          <PaletteAction
            icon={importing ? Loader2 : Download}
            label={importing ? "DOI en PDF ophalen…" : "DOI importeren en open PDF opslaan"}
            hint="Enter"
            disabled={!query.trim() || importing}
            onClick={() => onImportDoi(query.trim())}
          />
          <PaletteAction icon={Plus} label="Nieuw artikel" hint="N" onClick={() => run(onNew)} />
          <PaletteAction
            icon={FileUp}
            label="Bestand importeren (RIS, BibTeX, PubMed)"
            onClick={() => run(onImportFile)}
          />
          {selected && !selected.deletedAt && (
            <>
              <p className="section-label px-2.5 pt-3 pb-1">Huidig artikel</p>
              <PaletteAction
                icon={Copy}
                label={`Citaat kopiëren (${styleLabel})`}
                hint="C"
                onClick={() => run(onCopyApa)}
              />
              <PaletteAction
                icon={Share2}
                label={selected.hasPdf ? "PDF exporteren / delen" : "Artikelinfo delen"}
                onClick={() => run(() => onExport(selected.hasPdf ? "pdf" : "summary"))}
              />
              <PaletteAction
                icon={Braces}
                label="BibTeX exporteren"
                onClick={() => run(() => onExport("bibtex"))}
              />
            </>
          )}
          <div className="mt-1.5 border-t border-[var(--border)] pt-1.5 lg:hidden">
            <PaletteAction icon={X} label="Sluiten" onClick={onClose} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AddSheet({
  onClose,
  onUploadPdf,
  onDoi,
  onManual,
  onImportFile,
}: {
  onClose: () => void;
  onUploadPdf: () => void;
  onDoi: () => void;
  onManual: () => void;
  onImportFile: () => void;
}) {
  function run(fn: () => void) {
    onClose();
    fn();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center lg:hidden"
      style={{ background: "var(--overlay)" }}
    >
      <button type="button" className="absolute inset-0" aria-label="Sluiten" onClick={onClose} />
      <div className="relative w-full rounded-t-2xl border-t border-[var(--border)] bg-[var(--bg-panel)] px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-lg)]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border-strong)]" />
        <h2 className="text-base font-semibold">Artikel toevoegen</h2>
        <div className="mt-3 space-y-2">
          <SheetOption
            icon={Upload}
            title="PDF uploaden"
            description="Nieuw artikel, metadata via DOI als die in de PDF staat"
            primary
            onClick={() => run(onUploadPdf)}
          />
          <SheetOption
            icon={Download}
            title="DOI plakken"
            description="Metadata ophalen via Crossref"
            onClick={() => run(onDoi)}
          />
          <SheetOption
            icon={FileUp}
            title="Bestand importeren"
            description="RIS, BibTeX of PubMed (.nbib) uit Zotero, EndNote of PubMed"
            onClick={() => run(onImportFile)}
          />
          <SheetOption
            icon={PenLine}
            title="Handmatig invoeren"
            description="Titel, auteurs en overige gegevens zelf invullen"
            onClick={() => run(onManual)}
          />
          <button
            type="button"
            className="btn-ghost min-h-11 w-full rounded-lg px-3 py-2 text-sm font-medium"
            onClick={onClose}
          >
            Annuleren
          </button>
        </div>
      </div>
    </div>
  );
}

const emptyForm = {
  title: "",
  authors: "",
  year: "",
  journal: "",
  doi: "",
  abstract: "",
};

const FORM_FIELDS: {
  key: Exclude<keyof typeof emptyForm, "abstract">;
  label: string;
  placeholder?: string;
  hint?: string;
  span?: string;
}[] = [
  { key: "title", label: "Titel" },
  {
    key: "authors",
    label: "Auteurs",
    placeholder: "Jan Jansen; Piet Pietersen",
    hint: "Scheid auteurs met een puntkomma.",
  },
  { key: "journal", label: "Tijdschrift", span: "sm:col-span-4" },
  { key: "year", label: "Jaar", placeholder: "2024", span: "sm:col-span-2" },
  { key: "doi", label: "DOI", placeholder: "10.1038/…" },
];

/** "Jan van der Berg" → voornaam "Jan van der", achternaam "Berg" (zoals voorheen). */
function parseAuthors(raw: string) {
  return raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((full) => {
      const parts = full.split(/\s+/);
      const familyName = parts.pop() ?? "";
      return { givenName: parts.join(" "), familyName };
    });
}

export function ReferenceForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (item: ReferenceRecord) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await api<{ item: ReferenceRecord }>("/api/references", {
      method: "POST",
      body: {
        title: form.title,
        year: form.year ? Number(form.year) : null,
        journal: form.journal || null,
        doi: form.doi || null,
        abstract: form.abstract || null,
        authors: parseAuthors(form.authors),
      },
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("Artikel niet opgeslagen", res.error);
      return;
    }
    onCreated(res.data.item);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 max-lg:items-end max-lg:p-0"
      style={{ background: "var(--overlay)" }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] shadow-[var(--shadow-lg)] max-lg:max-h-[min(92dvh,100%)] max-lg:overflow-y-auto max-lg:rounded-b-none max-lg:rounded-t-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Nieuw artikel</h2>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">
              Heb je een DOI? Vul die in en haal daarna de metadata op.
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
        <div className="grid grid-cols-6 gap-x-3 gap-y-4 px-5 py-5">
          {FORM_FIELDS.map((f) => (
            <label key={f.key} className={cn("col-span-6 block space-y-1.5", f.span)}>
              <span className="text-sm font-medium">
                {f.label}
                {f.key === "title" && <span className="text-[var(--danger)]"> *</span>}
              </span>
              <input
                placeholder={f.placeholder}
                inputMode={f.key === "year" ? "numeric" : undefined}
                value={form[f.key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                className={cn(
                  "input w-full rounded-lg px-3 py-2 text-sm max-lg:min-h-11",
                  f.key === "doi" && "font-mono text-[0.8125rem]",
                )}
              />
              {f.hint && <span className="block text-xs text-[var(--text-subtle)]">{f.hint}</span>}
            </label>
          ))}
          <label className="col-span-6 block space-y-1.5">
            <span className="text-sm font-medium">Abstract</span>
            <textarea
              value={form.abstract}
              onChange={(e) => setForm((f) => ({ ...f, abstract: e.target.value }))}
              className="input w-full rounded-lg px-3 py-2 text-sm"
              rows={4}
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--bg-subtle)] px-5 py-3 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            className="btn-secondary rounded-lg px-3.5 py-2 text-sm max-lg:min-h-11"
            onClick={onClose}
          >
            Annuleren
          </button>
          <button
            type="button"
            disabled={!form.title.trim() || saving}
            className="btn-primary rounded-lg px-3.5 py-2 text-sm max-lg:min-h-11"
            onClick={() => void save()}
          >
            {saving ? "Opslaan…" : "Artikel opslaan"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DropOverlay({ importing }: { importing: boolean }) {
  return (
    <div
      className="pointer-events-none absolute inset-3 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-[var(--accent)] backdrop-blur-[2px]"
      style={{ background: "color-mix(in srgb, var(--accent-soft) 80%, transparent)" }}
    >
      <div className="card flex items-center gap-3 px-5 py-4 shadow-[var(--shadow-lg)]">
        {importing ? (
          <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
        ) : (
          <Upload className="h-5 w-5 text-[var(--accent)]" />
        )}
        <div>
          <p className="text-sm font-medium">
            {importing ? "PDF importeren…" : "Laat los om te importeren"}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            {importing
              ? "DOI en metadata worden opgezocht"
              : "Er wordt een nieuw artikel met metadata aangemaakt"}
          </p>
        </div>
      </div>
    </div>
  );
}
