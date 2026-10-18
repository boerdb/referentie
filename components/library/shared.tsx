import { BookOpen, Circle, CircleCheck, Library, type LucideIcon } from "lucide-react";
import type { SessionPayload } from "@/lib/auth/session";
import { LABELS, type ReferenceRecord, type RefStatus } from "@/lib/references/types";
import { cn } from "@/lib/utils";

export type FilterStatus = RefStatus | "all";

export const STATUS_LABEL: Record<RefStatus, string> = {
  unread: "Ongelezen",
  reading: "Bezig",
  read: "Gelezen",
};

export const STATUS_ICON: Record<FilterStatus, LucideIcon> = {
  all: Library,
  unread: Circle,
  reading: BookOpen,
  read: CircleCheck,
};

const STATUS_DOT: Record<RefStatus, string> = {
  unread: "bg-[var(--text-subtle)]",
  reading: "bg-[var(--warning)]",
  read: "bg-[var(--success)]",
};

export const STATUSES = ["unread", "reading", "read"] as const;

/** Sleepdata voor artikelen (naar een groep in de zijbalk). */
export const DRAG_MIME = "application/x-referentie-ids";

export function labelInfo(label: number | null | undefined) {
  return LABELS.find((l) => l.id === label) ?? null;
}

export function LabelDot({ label, className }: { label: number | null; className?: string }) {
  const info = labelInfo(label);
  if (!info) return null;
  return (
    <span
      className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", className)}
      style={{ background: info.color }}
      title={info.name}
      aria-label={`Label ${info.name.toLowerCase()}`}
    />
  );
}

/** Zeven kleuren plus "geen", zoals de labels in Bookends. */
export function LabelPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (label: number | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Kleurlabel">
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        title="Geen label"
        onClick={() => onChange(null)}
        className={cn(
          "grid h-6 w-6 place-items-center rounded-full border border-dashed border-[var(--border-strong)] text-[0.625rem] text-[var(--text-subtle)] max-lg:h-9 max-lg:w-9",
          value === null && "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg-panel)]",
        )}
      >
        ×
      </button>
      {LABELS.map((l) => (
        <button
          key={l.id}
          type="button"
          role="radio"
          aria-checked={value === l.id}
          title={l.name}
          aria-label={l.name}
          onClick={() => onChange(l.id)}
          className={cn(
            "h-6 w-6 rounded-full max-lg:h-9 max-lg:w-9",
            value === l.id && "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-panel)]",
          )}
          style={{ background: l.color }}
        />
      ))}
    </div>
  );
}

export function isDesktop(): boolean {
  return !window.matchMedia("(max-width: 1023px)").matches;
}

export function initials(user: SessionPayload) {
  const source = user.name?.trim() || user.email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).slice(0, 2) || "?";
}

export function authorShort(authors: ReferenceRecord["authors"]) {
  const first = authors[0]?.familyName;
  if (!first) return null;
  if (authors.length === 1) return first;
  if (authors.length === 2) return `${first} & ${authors[1].familyName}`;
  return `${first} et al.`;
}

export function authorList(authors: ReferenceRecord["authors"]) {
  return authors.map((a) => `${a.givenName} ${a.familyName}`.trim()).join(", ");
}

export function StatusDot({ status, className }: { status: RefStatus; className?: string }) {
  return (
    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[status], className)} aria-hidden />
  );
}

export function StatusBadge({ status }: { status: RefStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-[var(--border)] px-1.5 py-px text-[0.6875rem] font-medium text-[var(--text-muted)]">
      <StatusDot status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-4 py-5 lg:px-6">
      <h3 className="section-label mb-3">{title}</h3>
      {children}
    </section>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cn("btn-ghost grid h-8 w-8 place-items-center rounded-md", className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function FilterBtn({
  active,
  icon: Icon,
  count,
  onClick,
  children,
}: {
  active: boolean;
  icon: LucideIcon;
  count?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors max-lg:py-3",
        active
          ? "bg-[var(--bg-panel)] font-medium text-[var(--text)] shadow-[var(--shadow-soft)] ring-1 ring-[var(--border)]"
          : "btn-ghost",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          active ? "text-[var(--accent)]" : "text-[var(--text-subtle)]",
        )}
      />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count !== undefined && count > 0 && (
        <span className="text-xs font-normal text-[var(--text-subtle)] tabular-nums">{count}</span>
      )}
    </button>
  );
}

export function PaletteAction({
  icon: Icon,
  label,
  hint,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="btn-ghost flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left !text-[var(--text)] max-lg:min-h-11"
      onClick={onClick}
    >
      <Icon className="h-4 w-4 shrink-0 text-[var(--text-subtle)]" />
      <span className="flex-1">{label}</span>
      {hint && <span className="kbd hidden lg:inline-flex">{hint}</span>}
    </button>
  );
}

export function SheetOption({
  icon: Icon,
  title,
  description,
  primary,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left",
        primary ? "btn-primary" : "btn-secondary",
      )}
    >
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
          primary ? "bg-white/15" : "bg-[var(--bg-subtle)] text-[var(--text-muted)]",
        )}
      >
        <Icon className="h-[1.125rem] w-[1.125rem]" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs font-normal opacity-75">{description}</span>
      </span>
    </button>
  );
}

/** Segmentknop voor de leesstatus (mobiel en desktop). */
export function StatusSegments({
  status,
  onChange,
  compact,
}: {
  status: RefStatus;
  onChange: (status: RefStatus) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg bg-[var(--bg-subtle)]",
        compact ? "mr-1 flex p-0.5" : "mx-3 mb-2 grid grid-cols-3 gap-1 p-1",
      )}
      role="radiogroup"
      aria-label="Leesstatus"
    >
      {STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={status === s}
          onClick={() => onChange(s)}
          className={cn(
            "rounded-md text-xs font-medium",
            compact
              ? "inline-flex items-center gap-1.5 px-2.5 py-1 transition"
              : "min-w-0 truncate px-1 py-2",
            status === s
              ? "bg-[var(--bg-panel)] text-[var(--text)] shadow-sm ring-1 ring-[var(--border)]"
              : "text-[var(--text-muted)] hover:text-[var(--text)]",
          )}
        >
          {compact && <StatusDot status={s} />}
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}
