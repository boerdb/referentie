"use client";

import { Command, FileText, Inbox, Menu, Plus, Search, Star, Trash2, Upload } from "lucide-react";
import type { ReferenceRecord } from "@/lib/references/types";
import { cn } from "@/lib/utils";
import { StatusBadge, authorShort } from "./shared";

type Props = {
  title: string;
  items: ReferenceRecord[];
  loading: boolean;
  error: string | null;
  filtered: boolean;
  trash: boolean;
  selectedId: string | null;
  /** Extra klassen voor zichtbaarheid per schermbreedte. */
  className?: string;
  query: string;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onQueryChange: (q: string) => void;
  onSelect: (id: string) => void;
  onOpenMenu: () => void;
  onOpenPalette: () => void;
  onAdd: () => void;
  onUploadPdf: () => void;
  onManual: () => void;
  onEmptyTrash: () => void;
};

export function ReferenceList({
  title,
  items,
  loading,
  error,
  filtered,
  trash,
  selectedId,
  className,
  query,
  searchRef,
  onQueryChange,
  onSelect,
  onOpenMenu,
  onOpenPalette,
  onAdd,
  onUploadPdf,
  onManual,
  onEmptyTrash,
}: Props) {
  return (
    <section
      className={cn(
        "panel h-full min-w-0 flex-col overflow-x-hidden max-lg:w-full lg:min-h-0 lg:flex-1",
        className,
      )}
    >
      {/* Op desktop staan titel en zoekveld in de werkbalk en de lijstkop. */}
      <div className="space-y-3 border-b border-[var(--border)] px-3 pt-3 pb-3 lg:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-ghost -ml-1 grid h-11 w-11 shrink-0 place-items-center rounded-lg lg:hidden"
            aria-label="Menu"
            onClick={onOpenMenu}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[0.9375rem] font-semibold tracking-tight">{title}</h2>
            <p className={cn("text-xs", error ? "text-[var(--danger)]" : "text-[var(--text-muted)]")}>
              {error
                ? `Laden mislukt: ${error}`
                : loading && items.length === 0
                ? "Laden…"
                : `${items.length} ${items.length === 1 ? "artikel" : "artikelen"}`}
            </p>
          </div>
          {trash ? (
            <button
              type="button"
              className="btn-secondary btn-danger inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm lg:h-8"
              disabled={items.length === 0}
              onClick={onEmptyTrash}
            >
              <Trash2 className="h-4 w-4" />
              Legen
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn-ghost hidden h-8 w-8 place-items-center rounded-md lg:grid"
                title="Opdrachtenpalet (Ctrl+K)"
                aria-label="Opdrachtenpalet"
                onClick={onOpenPalette}
              >
                <Command className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="btn-primary inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-sm max-lg:w-11 max-lg:px-0 lg:h-8"
                title="Nieuw artikel (n)"
                aria-label="Nieuw artikel"
                onClick={onAdd}
              >
                <Plus className="h-4 w-4" />
                <span className="hidden lg:inline">Nieuw</span>
              </button>
            </>
          )}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-subtle)]" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={trash ? "Zoek in de prullenbak…" : "Zoek op titel, auteur, DOI…"}
            className="input w-full rounded-lg py-2 pr-10 pl-9 text-sm max-lg:h-11 max-lg:py-2.5"
          />
          <span className="kbd pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 lg:inline-flex">
            /
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && items.length === 0 && <ListSkeleton />}
        {!loading && !error && items.length === 0 && (
          <EmptyList
            trash={trash}
            filtered={filtered}
            onUploadPdf={onUploadPdf}
            onManual={onManual}
          />
        )}
        {items.map((item) => (
          <ListRow
            key={item.id}
            item={item}
            active={selectedId === item.id}
            onSelect={() => onSelect(item.id)}
          />
        ))}
      </div>
    </section>
  );
}

function ListRow({
  item,
  active,
  onSelect,
}: {
  item: ReferenceRecord;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative block w-full border-b border-[var(--border)] px-4 py-3.5 text-left transition-colors",
        active
          ? "bg-[var(--accent-soft)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--accent)]"
          : "hover:bg-[var(--bg-hover)]",
      )}
    >
      <div className="flex items-start gap-2">
        <p className={cn("line-clamp-2 flex-1 text-sm leading-snug font-medium", active && "text-[var(--text)]")}>
          {item.title}
        </p>
        {item.starred && (
          <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-[var(--star)] text-[var(--star)]" />
        )}
      </div>
      <p className="mt-1 truncate text-xs text-[var(--text-muted)]">
        {[authorShort(item.authors), item.year, item.journal].filter(Boolean).join(" · ")}
      </p>
      <div className="mt-2 flex items-center gap-1.5">
        <StatusBadge status={item.status} />
        {item.hasPdf && (
          <span className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-1.5 py-px text-[0.6875rem] font-medium text-[var(--text-muted)]">
            <FileText className="h-3 w-3" /> PDF
          </span>
        )}
        {item.deletedAt && (
          <span className="ml-auto text-[0.6875rem] text-[var(--text-subtle)]">
            Verwijderd {formatDate(item.deletedAt)}
          </span>
        )}
      </div>
    </button>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

function ListSkeleton() {
  return (
    <div className="space-y-px" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="space-y-2 border-b border-[var(--border)] px-4 py-4">
          <div className="h-3.5 w-11/12 animate-pulse rounded bg-[var(--bg-subtle)]" />
          <div className="h-3.5 w-2/3 animate-pulse rounded bg-[var(--bg-subtle)]" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--bg-subtle)]" />
        </div>
      ))}
    </div>
  );
}

function EmptyList({
  trash,
  filtered,
  onUploadPdf,
  onManual,
}: {
  trash: boolean;
  filtered: boolean;
  onUploadPdf: () => void;
  onManual: () => void;
}) {
  if (trash) {
    return (
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--bg-subtle)] text-[var(--text-muted)]">
          <Trash2 className="h-5 w-5" />
        </span>
        <p className="mt-4 text-sm font-medium">De prullenbak is leeg</p>
        <p className="mt-1 max-w-[16rem] text-sm text-[var(--text-muted)]">
          Verwijderde artikelen komen hier, tot je de prullenbak leegt.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--bg-subtle)] text-[var(--text-muted)]">
        <Inbox className="h-5 w-5" />
      </span>
      <p className="mt-4 text-sm font-medium">
        {filtered ? "Geen artikelen gevonden" : "Nog geen artikelen"}
      </p>
      <p className="mt-1 hidden max-w-[16rem] text-sm text-[var(--text-muted)] lg:block">
        Sleep een PDF hierheen, plak een DOI via <span className="kbd">Ctrl</span>{" "}
        <span className="kbd">K</span> of voeg handmatig een artikel toe.
      </p>
      <p className="mt-1 max-w-[16rem] text-sm text-[var(--text-muted)] lg:hidden">
        Upload een PDF of voeg er een handmatig toe.
      </p>
      <div className="mt-5 w-full max-w-[16rem] space-y-2 lg:hidden">
        <button
          type="button"
          className="btn-primary flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm"
          onClick={onUploadPdf}
        >
          <Upload className="h-4 w-4" /> PDF uploaden
        </button>
        <button
          type="button"
          className="btn-secondary flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm"
          onClick={onManual}
        >
          <Plus className="h-4 w-4" /> Handmatig artikel
        </button>
      </div>
    </div>
  );
}
