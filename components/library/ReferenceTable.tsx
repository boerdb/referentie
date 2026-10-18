"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Circle, Columns3, FileText, Star } from "lucide-react";
import type { ReferenceRecord } from "@/lib/references/types";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, StatusDot, authorShort } from "./shared";

export type ColumnId = "starred" | "author" | "year" | "title" | "journal" | "status" | "pdf" | "added";
export type SortState = { column: ColumnId; dir: "asc" | "desc" } | null;
export type Density = "compact" | "comfortable";

type Column = {
  id: ColumnId;
  label: string;
  /** Standaardbreedte in px; `null` = vult de resterende ruimte (titel). */
  width: number | null;
  min: number;
  /** Kan niet verborgen worden. */
  fixed?: boolean;
  align?: "center" | "right";
  /** `null` = leeg; lege waarden komen altijd onderaan. */
  sortValue: (r: ReferenceRecord) => string | number | null;
};

export const COLUMNS: Column[] = [
  { id: "starred", label: "Favoriet", width: 30, min: 30, align: "center", sortValue: (r) => (r.starred ? 0 : 1) },
  {
    id: "author",
    label: "Auteur",
    width: 130,
    min: 80,
    sortValue: (r) => r.authors[0]?.familyName?.toLocaleLowerCase("nl") || null,
  },
  { id: "year", label: "Jaar", width: 52, min: 46, align: "right", sortValue: (r) => r.year ?? null },
  { id: "title", label: "Titel", width: null, min: 200, fixed: true, sortValue: (r) => r.title.toLocaleLowerCase("nl") },
  {
    id: "journal",
    label: "Tijdschrift",
    width: 130,
    min: 80,
    sortValue: (r) => r.journal?.toLocaleLowerCase("nl") || null,
  },
  {
    id: "status",
    label: "Status",
    width: 34,
    min: 34,
    align: "center",
    sortValue: (r) => ({ unread: 0, reading: 1, read: 2 })[r.status],
  },
  { id: "pdf", label: "PDF", width: 34, min: 34, align: "center", sortValue: (r) => (r.hasPdf ? 0 : 1) },
  { id: "added", label: "Toegevoegd", width: 96, min: 80, align: "right", sortValue: (r) => r.createdAt },
];

export const DEFAULT_COLUMNS: ColumnId[] = ["starred", "author", "year", "title", "journal", "status", "pdf"];

/** Sorteert een kopie; zonder sortering blijft de volgorde van de server (laatst gewijzigd). */
export function sortReferences(items: ReferenceRecord[], sort: SortState): ReferenceRecord[] {
  if (!sort) return items;
  const column = COLUMNS.find((c) => c.id === sort.column);
  if (!column) return items;
  const factor = sort.dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const x = column.sortValue(a);
    const y = column.sortValue(b);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    if (x < y) return -1 * factor;
    if (x > y) return 1 * factor;
    return 0;
  });
}

type Props = {
  items: ReferenceRecord[];
  loading: boolean;
  selectedIds: Set<string>;
  primaryId: string | null;
  visibleColumns: ColumnId[];
  widths: Partial<Record<ColumnId, number>>;
  sort: SortState;
  density: Density;
  emptyState: React.ReactNode;
  onSortChange: (sort: SortState) => void;
  onColumnsChange: (columns: ColumnId[]) => void;
  onWidthsChange: (widths: Partial<Record<ColumnId, number>>) => void;
  onRowClick: (id: string, mods: { range: boolean; toggle: boolean }) => void;
  onRowOpen: (id: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
};

export function ReferenceTable({
  items,
  loading,
  selectedIds,
  primaryId,
  visibleColumns,
  widths,
  sort,
  density,
  emptyState,
  onSortChange,
  onColumnsChange,
  onWidthsChange,
  onRowClick,
  onRowOpen,
  onKeyDown,
}: Props) {
  // Tijdens het slepen lokaal bijhouden; pas bij loslaten opslaan.
  const [draftWidths, setDraftWidths] = useState<Partial<Record<ColumnId, number>> | null>(null);
  const effectiveWidths = draftWidths ?? widths;
  const columns = COLUMNS.filter((c) => c.fixed || visibleColumns.includes(c.id));
  const template = columns
    .map((c) =>
      c.width === null ? `minmax(${c.min}px, 1fr)` : `${effectiveWidths[c.id] ?? c.width}px`,
    )
    .join(" ");
  // Vaste minimale breedte: zo past alles, en krimpt de titel nooit onder zijn minimum.
  const minWidth =
    columns.reduce((sum, c) => sum + (c.width === null ? c.min : (effectiveWidths[c.id] ?? c.width)), 0) + 28;
  const rowStyle = { gridTemplateColumns: `${template} 28px`, minWidth };
  const rowHeight = density === "compact" ? "h-7" : "h-9";
  const primaryRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Geselecteerde rij in beeld houden bij navigeren met het toetsenbord.
  useEffect(() => {
    primaryRef.current?.scrollIntoView({ block: "nearest" });
  }, [primaryId]);

  function toggleSort(id: ColumnId) {
    if (sort?.column !== id) onSortChange({ column: id, dir: id === "year" || id === "added" ? "desc" : "asc" });
    else if (sort.dir === "asc") onSortChange({ column: id, dir: "desc" });
    else if (id === "year" || id === "added") onSortChange({ column: id, dir: "asc" });
    else onSortChange(null);
  }

  function startResize(e: React.PointerEvent, column: Column) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = widths[column.id] ?? column.width ?? column.min;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    let latest = startWidth;
    function onMove(ev: PointerEvent) {
      latest = Math.max(column.min, Math.min(600, startWidth + ev.clientX - startX));
      setDraftWidths({ ...widths, [column.id]: latest });
    }
    function onUp() {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      setDraftWidths(null);
      if (latest !== startWidth) onWidthsChange({ ...widths, [column.id]: latest });
    }
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }

  return (
    <div
      data-table
      role="grid"
      aria-label="Artikelen"
      aria-multiselectable="true"
      aria-rowcount={items.length}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="relative min-h-0 flex-1 overflow-auto text-[0.8125rem] outline-none"
    >
      <div
        role="row"
        className="sticky top-0 z-10 grid h-7 border-b border-[var(--border)] bg-[var(--bg-subtle)] text-xs font-medium text-[var(--text-muted)]"
        style={rowStyle}
      >
        {columns.map((c) => (
          <div
            key={c.id}
            role="columnheader"
            aria-sort={sort?.column === c.id ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
            className="group relative flex min-w-0 items-center border-r border-[var(--border)] last:border-r-0"
          >
            <button
              type="button"
              onClick={() => toggleSort(c.id)}
              title={`Sorteren op ${c.label.toLowerCase()}`}
              className={cn(
                "flex h-full min-w-0 flex-1 items-center gap-1 px-2 hover:text-[var(--text)]",
                c.align === "right" && "justify-end",
                c.align === "center" && "justify-center px-0",
                sort?.column === c.id && "text-[var(--text)]",
              )}
            >
              {c.id === "starred" ? (
                <Star className="h-3.5 w-3.5" aria-label="Favoriet" />
              ) : c.id === "status" ? (
                <Circle className="h-3 w-3" aria-label="Leesstatus" />
              ) : c.id === "pdf" ? (
                <FileText className="h-3.5 w-3.5" aria-label="PDF" />
              ) : (
                <span className="truncate">{c.label}</span>
              )}
              {sort?.column === c.id &&
                (sort.dir === "asc" ? (
                  <ArrowUp className="h-3 w-3 shrink-0" />
                ) : (
                  <ArrowDown className="h-3 w-3 shrink-0" />
                ))}
            </button>
            {c.width !== null && (
              <span
                role="separator"
                aria-orientation="vertical"
                aria-label={`Breedte van ${c.label.toLowerCase()} aanpassen`}
                onPointerDown={(e) => startResize(e, c)}
                onDoubleClick={() => {
                  const rest = { ...widths };
                  delete rest[c.id];
                  onWidthsChange(rest);
                }}
                className="absolute top-0 right-[-3px] z-10 h-full w-1.5 cursor-col-resize hover:bg-[var(--accent-muted)]"
              />
            )}
          </div>
        ))}
        <div className="relative">
          <button
            type="button"
            title="Kolommen kiezen"
            aria-label="Kolommen kiezen"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="btn-ghost grid h-full w-full place-items-center"
          >
            <Columns3 className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <ColumnMenu
              visible={visibleColumns}
              onChange={onColumnsChange}
              onReset={() => {
                onColumnsChange(DEFAULT_COLUMNS);
                onWidthsChange({});
              }}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>

      {loading && items.length === 0 && (
        <div aria-hidden className="space-y-px p-1">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className={cn("animate-pulse rounded bg-[var(--bg-subtle)]", rowHeight)} />
          ))}
        </div>
      )}
      {!loading && items.length === 0 && emptyState}

      {items.map((item, index) => {
        const selected = selectedIds.has(item.id);
        const primary = item.id === primaryId;
        return (
          <div
            key={item.id}
            ref={primary ? primaryRef : undefined}
            role="row"
            aria-selected={selected}
            aria-rowindex={index + 1}
            onMouseDown={(e) => {
              // Shift-klik zou anders tekst selecteren.
              if (e.shiftKey) e.preventDefault();
            }}
            onClick={(e) =>
              onRowClick(item.id, { range: e.shiftKey, toggle: e.ctrlKey || e.metaKey })
            }
            onDoubleClick={() => onRowOpen(item.id)}
            className={cn(
              "grid cursor-default items-center border-b border-transparent select-none",
              rowHeight,
              selected
                ? "bg-[var(--accent-soft)] text-[var(--text)]"
                : index % 2 === 1
                  ? "bg-[var(--bg-subtle)]/60 hover:bg-[var(--bg-hover)]"
                  : "hover:bg-[var(--bg-hover)]",
              primary && selected && "shadow-[inset_2px_0_0_var(--accent)]",
            )}
            style={rowStyle}
          >
            {columns.map((c) => (
              <div
                key={c.id}
                role="gridcell"
                className={cn(
                  "min-w-0 truncate px-2",
                  c.align === "right" && "text-right tabular-nums",
                  c.align === "center" && "flex justify-center px-0",
                  c.id === "title" && "font-medium",
                  c.id !== "title" && c.id !== "starred" && "text-[var(--text-muted)]",
                  selected && "text-[var(--text)]",
                )}
                title={c.id === "title" ? item.title : undefined}
              >
                <Cell column={c.id} item={item} />
              </div>
            ))}
            <div />
          </div>
        );
      })}
    </div>
  );
}

function Cell({ column, item }: { column: ColumnId; item: ReferenceRecord }) {
  switch (column) {
    case "starred":
      return item.starred ? (
        <Star className="h-3.5 w-3.5 fill-[var(--star)] text-[var(--star)]" aria-label="Favoriet" />
      ) : null;
    case "author":
      return <>{authorShort(item.authors) ?? "—"}</>;
    case "year":
      return <>{item.year ?? ""}</>;
    case "title":
      return <>{item.title}</>;
    case "journal":
      return <>{item.journal ?? ""}</>;
    case "status":
      // Alleen een stip, zodat de titel ruimte houdt; de status staat in de tooltip.
      return (
        <span className="inline-flex h-full items-center" title={STATUS_LABEL[item.status]}>
          <StatusDot status={item.status} className="h-2 w-2" />
          <span className="sr-only">{STATUS_LABEL[item.status]}</span>
        </span>
      );
    case "pdf":
      return item.hasPdf ? (
        <FileText className="h-3.5 w-3.5 text-[var(--text-subtle)]" aria-label="Heeft PDF" />
      ) : null;
    case "added":
      return (
        <>
          {new Date(item.createdAt).toLocaleDateString("nl-NL", {
            day: "numeric",
            month: "short",
            year: "2-digit",
          })}
        </>
      );
  }
}

function ColumnMenu({
  visible,
  onChange,
  onReset,
  onClose,
}: {
  visible: ColumnId[];
  onChange: (columns: ColumnId[]) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      className="absolute top-full right-0 z-20 mt-1 w-48 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1 text-sm font-normal text-[var(--text)] shadow-[var(--shadow-lg)]"
    >
      <p className="section-label px-2 pt-1 pb-1.5">Kolommen</p>
      {COLUMNS.filter((c) => !c.fixed).map((c) => {
        const checked = visible.includes(c.id);
        return (
          <label
            key={c.id}
            role="menuitemcheckbox"
            aria-checked={checked}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--bg-hover)]"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() =>
                onChange(
                  checked
                    ? visible.filter((v) => v !== c.id)
                    : COLUMNS.filter((x) => x.id === c.id || visible.includes(x.id)).map((x) => x.id),
                )
              }
              className="accent-[var(--accent)]"
            />
            {c.label}
          </label>
        );
      })}
      <div className="mt-1 border-t border-[var(--border)] pt-1">
        <button
          type="button"
          className="w-full rounded-md px-2 py-1.5 text-left text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
          onClick={onReset}
        >
          Standaardkolommen
        </button>
      </div>
    </div>
  );
}
