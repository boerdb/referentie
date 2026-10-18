"use client";

import {
  BookOpenText,
  Command,
  LayoutList,
  PanelLeft,
  PanelRight,
  Plus,
  Search,
  Share2,
  Table2,
  X,
} from "lucide-react";
import type { SearchField } from "@/lib/library/hooks";
import { cn } from "@/lib/utils";

export type ListMode = "table" | "cards";

const FIELD_LABEL: Record<SearchField, string> = {
  all: "Alles",
  title: "Titel",
  author: "Auteur",
  journal: "Tijdschrift",
  doi: "DOI",
};

type Props = {
  query: string;
  field: SearchField;
  searchRef: React.RefObject<HTMLInputElement | null>;
  listMode: ListMode;
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  pdfOpen: boolean;
  canShare: boolean;
  canOpenPdf: boolean;
  trash: boolean;
  onQueryChange: (q: string) => void;
  onFieldChange: (field: SearchField) => void;
  onListModeChange: (mode: ListMode) => void;
  onToggleSidebar: () => void;
  onToggleInspector: () => void;
  onTogglePdf: () => void;
  onNew: () => void;
  onShare: () => void;
  onOpenPalette: () => void;
};

/** Werkbalk over de volle breedte, alleen op desktop (Bookends-stijl). */
export function Toolbar(props: Props) {
  const {
    query,
    field,
    searchRef,
    listMode,
    sidebarOpen,
    inspectorOpen,
    pdfOpen,
    canShare,
    canOpenPdf,
    trash,
  } = props;

  return (
    <div className="hidden h-12 shrink-0 items-center gap-1.5 border-b border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 lg:flex">
      <ToolButton label="Zijbalk tonen of verbergen" active={sidebarOpen} onClick={props.onToggleSidebar}>
        <PanelLeft className="h-4 w-4" />
      </ToolButton>
      <Segmented
        label="Lijstweergave"
        value={listMode}
        options={[
          { value: "table", label: "Tabel", icon: Table2 },
          { value: "cards", label: "Kaarten", icon: LayoutList },
        ]}
        onChange={props.onListModeChange}
      />

      <div className="mx-auto flex h-8 w-full max-w-xl items-center rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)]">
        <Search className="ml-2.5 h-4 w-4 shrink-0 text-[var(--text-subtle)]" />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => props.onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              props.onQueryChange("");
              e.currentTarget.blur();
            }
          }}
          placeholder={trash ? "Zoek in de prullenbak" : `Zoek in ${FIELD_LABEL[field].toLowerCase()}`}
          aria-label="Zoeken"
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-[var(--text-subtle)]"
        />
        {query ? (
          <button
            type="button"
            aria-label="Zoekterm wissen"
            className="btn-ghost mr-1 grid h-6 w-6 shrink-0 place-items-center rounded"
            onClick={() => props.onQueryChange("")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="kbd mr-1.5 shrink-0">/</span>
        )}
        <select
          value={field}
          onChange={(e) => props.onFieldChange(e.target.value as SearchField)}
          aria-label="Zoeken in"
          className="h-full shrink-0 rounded-r-lg border-l border-[var(--border)] bg-transparent px-2 text-xs font-medium text-[var(--text-muted)] outline-none hover:text-[var(--text)]"
        >
          {(Object.keys(FIELD_LABEL) as SearchField[]).map((f) => (
            <option key={f} value={f}>
              {FIELD_LABEL[f]}
            </option>
          ))}
        </select>
      </div>

      <ToolButton label="Opdrachtenpalet (Ctrl+K)" onClick={props.onOpenPalette}>
        <Command className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        label={pdfOpen ? "PDF sluiten (Spatie)" : "PDF lezen (Spatie)"}
        active={pdfOpen}
        disabled={!canOpenPdf && !pdfOpen}
        onClick={props.onTogglePdf}
      >
        <BookOpenText className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Delen of exporteren" disabled={!canShare} onClick={props.onShare}>
        <Share2 className="h-4 w-4" />
      </ToolButton>
      {!trash && (
        <button
          type="button"
          className="btn-primary inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm"
          title="Nieuw artikel (n)"
          onClick={props.onNew}
        >
          <Plus className="h-4 w-4" /> Nieuw
        </button>
      )}
      <ToolButton label="Inspector tonen of verbergen" active={inspectorOpen} onClick={props.onToggleInspector}>
        <PanelRight className="h-4 w-4" />
      </ToolButton>
    </div>
  );
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-md",
        active ? "bg-[var(--bg-panel)] text-[var(--text)] ring-1 ring-[var(--border)]" : "btn-ghost",
      )}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon: React.ComponentType<{ className?: string }> }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex rounded-lg bg-[var(--bg-hover)] p-0.5" role="radiogroup" aria-label={label}>
      {options.map(({ value: v, label: l, icon: Icon }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          title={l}
          aria-label={l}
          onClick={() => onChange(v)}
          className={cn(
            "grid h-7 w-8 place-items-center rounded-md",
            value === v
              ? "bg-[var(--bg-panel)] text-[var(--text)] shadow-sm ring-1 ring-[var(--border)]"
              : "text-[var(--text-muted)] hover:text-[var(--text)]",
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

export function StatusBar({
  total,
  selected,
  fetching,
  density,
  onDensityChange,
}: {
  total: number;
  selected: number;
  fetching: boolean;
  density: "compact" | "comfortable";
  onDensityChange: (density: "compact" | "comfortable") => void;
}) {
  return (
    <div className="hidden h-7 shrink-0 items-center gap-3 border-t border-[var(--border)] bg-[var(--bg-subtle)] px-3 text-xs text-[var(--text-muted)] lg:flex">
      <span className="tabular-nums">
        {total} {total === 1 ? "artikel" : "artikelen"}
        {selected > 1 && ` · ${selected} geselecteerd`}
      </span>
      {fetching && <span className="text-[var(--text-subtle)]">Bijwerken…</span>}
      <span className="ml-auto">Rijen:</span>
      <div className="flex gap-0.5" role="radiogroup" aria-label="Rijhoogte">
        {(["compact", "comfortable"] as const).map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={density === d}
            onClick={() => onDensityChange(d)}
            className={cn(
              "rounded px-1.5 py-px",
              density === d ? "bg-[var(--bg-panel)] text-[var(--text)] ring-1 ring-[var(--border)]" : "hover:text-[var(--text)]",
            )}
          >
            {d === "compact" ? "Compact" : "Ruim"}
          </button>
        ))}
      </div>
    </div>
  );
}
