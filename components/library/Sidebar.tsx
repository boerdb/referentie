"use client";

import Link from "next/link";
import { Command, FileText, LogOut, Search, Settings, Star, Trash2, Upload, X } from "lucide-react";
import { ThemeSelector } from "@/components/theme/ThemeSelector";
import { BrandMark } from "@/components/ui/BrandMark";
import type { SessionPayload } from "@/lib/auth/session";
import type { ReferenceCounts } from "@/lib/references/types";
import { FilterBtn, STATUS_ICON, STATUS_LABEL, initials, type FilterStatus } from "./shared";

export type LibraryView = { status: FilterStatus; starred: boolean; hasPdf: boolean; trash: boolean };

type Props = {
  user: SessionPayload;
  view: LibraryView;
  counts: ReferenceCounts | undefined;
  onViewChange: (view: LibraryView) => void;
  onClose: () => void;
  onUploadPdf: () => void;
  onOpenPalette: () => void;
  onLogout: () => void;
};

const STATUS_COUNT: Record<FilterStatus, keyof ReferenceCounts> = {
  all: "all",
  unread: "unread",
  reading: "reading",
  read: "read",
};

export function Sidebar({
  user,
  view,
  counts,
  onViewChange,
  onClose,
  onUploadPdf,
  onOpenPalette,
  onLogout,
}: Props) {
  function select(next: LibraryView) {
    onViewChange(next);
    onClose();
  }

  return (
    <aside className="flex h-full w-full flex-col border-r border-[var(--border)] bg-[var(--bg-subtle)] lg:w-[var(--sidebar-w)] lg:shrink-0 max-lg:bg-[var(--bg-panel)]">
      <div className="flex h-14 items-center gap-2.5 px-4">
        <BrandMark className="h-7 w-7 rounded-md [&>svg]:h-3.5 [&>svg]:w-3.5" />
        <p className="flex-1 text-[0.9375rem] font-semibold tracking-tight">Referentie</p>
        <button
          type="button"
          className="btn-ghost grid h-11 w-11 shrink-0 place-items-center rounded-lg lg:hidden"
          aria-label="Menu sluiten"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pt-2 pb-3 text-sm">
        <div className="space-y-0.5">
          <p className="section-label px-2.5 pb-1.5">Bibliotheek</p>
          {(["all", "unread", "reading", "read"] as const).map((s) => (
            <FilterBtn
              key={s}
              icon={STATUS_ICON[s]}
              active={!view.trash && view.status === s}
              count={counts?.[STATUS_COUNT[s]]}
              onClick={() => select({ ...view, status: s, trash: false })}
            >
              {s === "all" ? "Alle artikelen" : STATUS_LABEL[s]}
            </FilterBtn>
          ))}
          <FilterBtn
            icon={Trash2}
            active={view.trash}
            count={counts?.trash}
            onClick={() => select({ status: "all", starred: false, hasPdf: false, trash: true })}
          >
            Prullenbak
          </FilterBtn>
          <Link
            href="/zoeken"
            className="btn-ghost flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left max-lg:py-3"
            onClick={onClose}
          >
            <Search className="h-4 w-4 shrink-0 text-[var(--text-subtle)]" />
            Literatuur zoeken
          </Link>
        </div>
        {!view.trash && (
          <div className="space-y-0.5">
            <p className="section-label px-2.5 pb-1.5">Filters</p>
            <FilterBtn
              icon={Star}
              active={view.starred}
              count={counts?.starred}
              onClick={() => onViewChange({ ...view, starred: !view.starred })}
            >
              Favorieten
            </FilterBtn>
            <FilterBtn
              icon={FileText}
              active={view.hasPdf}
              count={counts?.hasPdf}
              onClick={() => onViewChange({ ...view, hasPdf: !view.hasPdf })}
            >
              Met PDF
            </FilterBtn>
          </div>
        )}
        <div className="space-y-0.5 lg:hidden">
          <p className="section-label px-2.5 pb-1.5">Toevoegen</p>
          <button
            type="button"
            className="btn-ghost flex w-full items-center gap-2.5 rounded-md px-2.5 py-3"
            onClick={() => {
              onClose();
              onUploadPdf();
            }}
          >
            <Upload className="h-4 w-4" /> PDF uploaden
          </button>
          <button
            type="button"
            className="btn-ghost flex w-full items-center gap-2.5 rounded-md px-2.5 py-3"
            onClick={() => {
              onClose();
              onOpenPalette();
            }}
          >
            <Command className="h-4 w-4" /> DOI / zoeken
          </button>
        </div>
      </nav>
      <div className="space-y-3 border-t border-[var(--border)] p-3 text-sm">
        <div className="lg:hidden">
          <p className="section-label mb-1.5 px-1">Thema</p>
          <ThemeSelector variant="icons" />
        </div>
        <div className="flex items-center gap-2.5 px-1">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent)] uppercase">
            {initials(user)}
          </span>
          <div className="min-w-0 flex-1">
            {user.name && <p className="truncate text-sm font-medium">{user.name}</p>}
            <p className="truncate text-xs text-[var(--text-muted)]">{user.email}</p>
          </div>
          <Link
            href="/instellingen"
            title="Instellingen"
            aria-label="Instellingen"
            className="btn-ghost grid h-8 w-8 shrink-0 place-items-center rounded-md max-lg:h-11 max-lg:w-11"
          >
            <Settings className="h-4 w-4" />
          </Link>
          <button
            type="button"
            title="Uitloggen"
            aria-label="Uitloggen"
            onClick={onLogout}
            className="btn-ghost grid h-8 w-8 shrink-0 place-items-center rounded-md max-lg:h-11 max-lg:w-11"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
