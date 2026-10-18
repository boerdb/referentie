"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Command,
  Copy,
  FileText,
  Filter,
  Folder,
  FolderPlus,
  LogOut,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Star,
  Tag,
  Trash2,
  TriangleAlert,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { ThemeSelector } from "@/components/theme/ThemeSelector";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { BrandMark } from "@/components/ui/BrandMark";
import type { SessionPayload } from "@/lib/auth/session";
import { usePref } from "@/lib/library/prefs";
import {
  LABELS,
  type GroupRecord,
  type ReferenceCounts,
  type TagRecord,
} from "@/lib/references/types";
import { cn } from "@/lib/utils";
import { DRAG_MIME, STATUS_ICON, STATUS_LABEL, initials, type FilterStatus } from "./shared";

export type LibraryView = {
  status: FilterStatus;
  starred: boolean;
  hasPdf: boolean;
  trash: boolean;
  group: string | null;
  tag: string | null;
  label: number | null;
  duplicates: boolean;
  /** Alleen artikelen met een retraction-melding. */
  retracted: boolean;
};

export const DEFAULT_VIEW: LibraryView = {
  status: "all",
  starred: false,
  hasPdf: false,
  trash: false,
  group: null,
  tag: null,
  label: null,
  duplicates: false,
  retracted: false,
};

/** Bron in de zijbalk; filters (favoriet, PDF) blijven daarbij staan. */
function source(view: LibraryView, patch: Partial<LibraryView>): LibraryView {
  return {
    ...view,
    status: "all",
    trash: false,
    group: null,
    tag: null,
    label: null,
    duplicates: false,
    retracted: false,
    ...patch,
  };
}

type MenuItem = { label: string; onClick: () => void; danger?: boolean };

type Props = {
  user: SessionPayload;
  view: LibraryView;
  counts: ReferenceCounts | undefined;
  groups: GroupRecord[];
  tags: TagRecord[];
  onViewChange: (view: LibraryView) => void;
  onClose: () => void;
  onUploadPdf: () => void;
  onOpenPalette: () => void;
  onLogout: () => void;
  onDropOnGroup: (groupId: string, ids: string[]) => void;
  onCreateGroup: (parentId: string | null) => void;
  onCreateSmart: () => void;
  onEditSmart: (group: GroupRecord) => void;
  onRenameGroup: (group: GroupRecord) => void;
  onDeleteGroup: (group: GroupRecord) => void;
  onRenameTag: (tag: TagRecord) => void;
  onDeleteTag: (tag: TagRecord) => void;
};

const STATUS_COUNT: Record<FilterStatus, keyof ReferenceCounts> = {
  all: "all",
  unread: "unread",
  reading: "reading",
  read: "read",
};

const NO_IDS: string[] = [];

export function Sidebar(props: Props) {
  const { user, view, counts, groups, tags, onViewChange, onClose } = props;
  const [collapsed, setCollapsed] = usePref<string[]>("sidebarCollapsed", NO_IDS);
  const manual = groups.filter((g) => g.kind === "manual");
  const smart = groups.filter((g) => g.kind === "smart");
  const inLibrary =
    !view.trash && !view.group && !view.tag && !view.label && !view.duplicates && !view.retracted;

  function select(next: LibraryView) {
    onViewChange(next);
    onClose();
  }

  function toggleCollapsed(key: string) {
    setCollapsed(collapsed.includes(key) ? collapsed.filter((k) => k !== key) : [...collapsed, key]);
  }

  function renderGroups(parentId: string | null, depth: number): React.ReactNode {
    return manual
      .filter((g) => g.parentId === parentId)
      .map((g) => {
        const children = manual.some((c) => c.parentId === g.id);
        const open = !collapsed.includes(`group:${g.id}`);
        return (
          <div key={g.id}>
            <SourceItem
              icon={Folder}
              depth={depth}
              active={view.group === g.id}
              count={g.count}
              expandable={children}
              expanded={open}
              onToggle={() => toggleCollapsed(`group:${g.id}`)}
              onClick={() => select(source(view, { group: g.id }))}
              onDropIds={(ids) => props.onDropOnGroup(g.id, ids)}
              menu={[
                { label: "Subgroep maken", onClick: () => props.onCreateGroup(g.id) },
                { label: "Naam wijzigen", onClick: () => props.onRenameGroup(g) },
                { label: "Groep verwijderen", onClick: () => props.onDeleteGroup(g), danger: true },
              ]}
            >
              {g.name}
            </SourceItem>
            {children && open && renderGroups(g.id, depth + 1)}
          </div>
        );
      });
  }

  return (
    <aside className="flex h-full w-full flex-col border-r border-[var(--border)] bg-[var(--bg-subtle)] lg:w-[var(--sidebar-w)] lg:shrink-0 max-lg:bg-[var(--bg-panel)]">
      <div className="flex h-14 items-center gap-2.5 px-4 lg:h-12">
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
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 pt-1 pb-3 text-sm">
        <Section title="Bibliotheek">
          {(["all", "unread", "reading", "read"] as const).map((s) => (
            <SourceItem
              key={s}
              icon={STATUS_ICON[s]}
              active={inLibrary && view.status === s}
              count={counts?.[STATUS_COUNT[s]]}
              onClick={() => select(source(view, { status: s }))}
            >
              {s === "all" ? "Alle artikelen" : STATUS_LABEL[s]}
            </SourceItem>
          ))}
          <SourceItem
            icon={Copy}
            active={view.duplicates}
            count={counts?.duplicates}
            onClick={() => select(source(view, { duplicates: true, starred: false, hasPdf: false }))}
          >
            Mogelijke dubbelen
          </SourceItem>
          {(counts?.retracted ?? 0) > 0 && (
            <SourceItem
              icon={TriangleAlert}
              active={view.retracted}
              count={counts?.retracted}
              onClick={() => select(source(view, { retracted: true, starred: false, hasPdf: false }))}
            >
              <span className="text-[var(--danger)]">Teruggetrokken</span>
            </SourceItem>
          )}
          <SourceItem
            icon={Trash2}
            active={view.trash}
            count={counts?.trash}
            onClick={() => select(source(view, { trash: true, starred: false, hasPdf: false }))}
          >
            Prullenbak
          </SourceItem>
          <Link
            href="/zoeken"
            className="btn-ghost flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left max-lg:py-3"
            onClick={onClose}
          >
            <Search className="h-4 w-4 shrink-0 text-[var(--text-subtle)]" />
            Literatuur zoeken
          </Link>
        </Section>

        <Section
          title="Groepen"
          collapsed={collapsed.includes("groups")}
          onToggle={() => toggleCollapsed("groups")}
          action={{ label: "Nieuwe groep", icon: FolderPlus, onClick: () => props.onCreateGroup(null) }}
        >
          {manual.length === 0 ? (
            <p className="px-2.5 py-1 text-xs text-[var(--text-subtle)]">
              Nog geen groepen. Sleep artikelen naar een groep om ze in te delen.
            </p>
          ) : (
            renderGroups(null, 0)
          )}
        </Section>

        <Section
          title="Slimme groepen"
          collapsed={collapsed.includes("smart")}
          onToggle={() => toggleCollapsed("smart")}
          action={{ label: "Nieuwe slimme groep", icon: Plus, onClick: props.onCreateSmart }}
        >
          {smart.length === 0 ? (
            <p className="px-2.5 py-1 text-xs text-[var(--text-subtle)]">
              Een slimme groep vult zichzelf op basis van regels, bijv. &quot;jaar na 2022 en heeft PDF&quot;.
            </p>
          ) : (
            smart.map((g) => (
              <SourceItem
                key={g.id}
                icon={Filter}
                active={view.group === g.id}
                count={g.count}
                onClick={() => select(source(view, { group: g.id }))}
                menu={[
                  { label: "Regels bewerken", onClick: () => props.onEditSmart(g) },
                  { label: "Naam wijzigen", onClick: () => props.onRenameGroup(g) },
                  { label: "Groep verwijderen", onClick: () => props.onDeleteGroup(g), danger: true },
                ]}
              >
                {g.name}
              </SourceItem>
            ))
          )}
        </Section>

        {tags.length > 0 && (
          <Section
            title="Trefwoorden"
            collapsed={collapsed.includes("tags")}
            onToggle={() => toggleCollapsed("tags")}
          >
            {tags.map((t) => (
              <SourceItem
                key={t.id}
                icon={Tag}
                active={view.tag === t.id}
                count={t.count}
                onClick={() => select(source(view, { tag: t.id }))}
                menu={[
                  { label: "Naam wijzigen", onClick: () => props.onRenameTag(t) },
                  { label: "Trefwoord verwijderen", onClick: () => props.onDeleteTag(t), danger: true },
                ]}
              >
                {t.name}
              </SourceItem>
            ))}
          </Section>
        )}

        <Section title="Labels">
          <div className="flex flex-wrap gap-1.5 px-2.5 py-1">
            {LABELS.map((l) => (
              <button
                key={l.id}
                type="button"
                title={l.name}
                aria-label={`Label ${l.name.toLowerCase()}`}
                aria-pressed={view.label === l.id}
                onClick={() => select(view.label === l.id ? source(view, {}) : source(view, { label: l.id }))}
                className={cn(
                  "h-5 w-5 rounded-full transition max-lg:h-8 max-lg:w-8",
                  view.label === l.id
                    ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-subtle)]"
                    : "opacity-80 hover:opacity-100",
                )}
                style={{ background: l.color }}
              />
            ))}
          </div>
        </Section>

        {!view.trash && !view.duplicates && (
          <Section title="Filters">
            <SourceItem
              icon={Star}
              active={view.starred}
              count={counts?.starred}
              onClick={() => onViewChange({ ...view, starred: !view.starred })}
            >
              Favorieten
            </SourceItem>
            <SourceItem
              icon={FileText}
              active={view.hasPdf}
              count={counts?.hasPdf}
              onClick={() => onViewChange({ ...view, hasPdf: !view.hasPdf })}
            >
              Met PDF
            </SourceItem>
          </Section>
        )}

        <div className="space-y-0.5 lg:hidden">
          <p className="section-label px-2.5 pb-1.5">Toevoegen</p>
          <button
            type="button"
            className="btn-ghost flex w-full items-center gap-2.5 rounded-md px-2.5 py-3"
            onClick={() => {
              onClose();
              props.onUploadPdf();
            }}
          >
            <Upload className="h-4 w-4" /> PDF uploaden
          </button>
          <button
            type="button"
            className="btn-ghost flex w-full items-center gap-2.5 rounded-md px-2.5 py-3"
            onClick={() => {
              onClose();
              props.onOpenPalette();
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
            onClick={props.onLogout}
            className="btn-ghost grid h-8 w-8 shrink-0 place-items-center rounded-md max-lg:h-11 max-lg:w-11"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function Section({
  title,
  collapsed,
  onToggle,
  action,
  children,
}: {
  title: string;
  collapsed?: boolean;
  onToggle?: () => void;
  action?: { label: string; icon: LucideIcon; onClick: () => void };
  children: React.ReactNode;
}) {
  const ActionIcon = action?.icon;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center pr-1">
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            className="section-label flex flex-1 items-center gap-1 px-2.5 pb-1 text-left hover:text-[var(--text-muted)]"
          >
            {title}
            <ChevronRight
              className={cn("h-3 w-3 transition-transform", !collapsed && "rotate-90")}
              aria-hidden
            />
          </button>
        ) : (
          <p className="section-label flex-1 px-2.5 pb-1">{title}</p>
        )}
        {action && ActionIcon && (
          <button
            type="button"
            title={action.label}
            aria-label={action.label}
            onClick={action.onClick}
            className="btn-ghost -mt-1 grid h-6 w-6 place-items-center rounded max-lg:h-10 max-lg:w-10"
          >
            <ActionIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {!collapsed && children}
    </div>
  );
}

function SourceItem({
  icon: Icon,
  active,
  count,
  depth = 0,
  expandable,
  expanded,
  onToggle,
  onClick,
  onDropIds,
  menu,
  children,
}: {
  icon: LucideIcon;
  active: boolean;
  count?: number;
  depth?: number;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onClick: () => void;
  onDropIds?: (ids: string[]) => void;
  menu?: MenuItem[];
  children: React.ReactNode;
}) {
  const [dropping, setDropping] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [contextAt, setContextAt] = useState<{ x: number; y: number } | null>(null);

  return (
    <div
      className={cn(
        "group/item relative flex items-center rounded-md transition-colors",
        active
          ? "bg-[var(--bg-panel)] font-medium text-[var(--text)] shadow-[var(--shadow-soft)] ring-1 ring-[var(--border)]"
          : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]",
        dropping && "bg-[var(--accent-soft)] ring-2 ring-[var(--accent)]",
      )}
      style={{ paddingLeft: depth * 14 }}
      onContextMenu={
        menu
          ? (e) => {
              e.preventDefault();
              setMenuOpen(false);
              setContextAt({ x: e.clientX, y: e.clientY });
            }
          : undefined
      }
      onDragOver={
        onDropIds
          ? (e) => {
              if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              setDropping(true);
            }
          : undefined
      }
      onDragLeave={onDropIds ? () => setDropping(false) : undefined}
      onDrop={
        onDropIds
          ? (e) => {
              const raw = e.dataTransfer.getData(DRAG_MIME);
              setDropping(false);
              if (!raw) return;
              e.preventDefault();
              e.stopPropagation();
              try {
                const ids = JSON.parse(raw) as string[];
                if (Array.isArray(ids) && ids.length > 0) onDropIds(ids);
              } catch {
                /* ongeldige sleepdata */
              }
            }
          : undefined
      }
    >
      {expandable ? (
        <button
          type="button"
          aria-label={expanded ? "Inklappen" : "Uitklappen"}
          aria-expanded={expanded}
          onClick={onToggle}
          className="grid h-7 w-4 shrink-0 place-items-center text-[var(--text-subtle)] max-lg:h-11"
        >
          <ChevronRight className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")} />
        </button>
      ) : depth > 0 ? (
        <span className="w-4 shrink-0" />
      ) : null}
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 py-1.5 text-left max-lg:py-3",
          expandable || depth > 0 ? "pr-2.5 pl-1" : "px-2.5",
        )}
      >
        <Icon
          className={cn("h-4 w-4 shrink-0", active ? "text-[var(--accent)]" : "text-[var(--text-subtle)]")}
        />
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {count !== undefined && count > 0 && (
          <span
            className={cn(
              "text-xs font-normal text-[var(--text-subtle)] tabular-nums",
              menu && "lg:group-hover/item:hidden",
            )}
          >
            {count}
          </span>
        )}
      </button>
      {menu && (
        <button
          type="button"
          aria-label="Opties"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className={cn(
            "btn-ghost mr-1 grid h-6 w-6 shrink-0 place-items-center rounded max-lg:h-10 max-lg:w-10",
            !menuOpen && "lg:hidden lg:group-hover/item:grid",
          )}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      )}
      {menuOpen && menu && <ItemMenu items={menu} onClose={() => setMenuOpen(false)} />}
      {contextAt && menu && (
        <ContextMenu
          x={contextAt.x}
          y={contextAt.y}
          entries={menu.map((item) => ({ label: item.label, onSelect: item.onClick, danger: item.danger }))}
          onClose={() => setContextAt(null)}
        />
      )}
    </div>
  );
}

function ItemMenu({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
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
      className="absolute top-full right-1 z-30 mt-1 w-48 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1 text-sm font-normal shadow-[var(--shadow-lg)]"
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            item.onClick();
          }}
          className={cn(
            "w-full rounded-md px-2.5 py-1.5 text-left hover:bg-[var(--bg-hover)] max-lg:py-2.5",
            item.danger ? "text-[var(--danger)]" : "text-[var(--text)]",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
