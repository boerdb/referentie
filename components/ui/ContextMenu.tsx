"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type MenuEntry =
  | {
      kind?: "item";
      label: string;
      onSelect?: () => void;
      danger?: boolean;
      disabled?: boolean;
      hint?: string;
      /** Uitklapmenu (bijv. "Aan groep toevoegen ▸"). */
      children?: MenuEntry[];
    }
  | { kind: "separator" }
  | { kind: "custom"; render: (close: () => void) => React.ReactNode };

/**
 * Rechtsklikmenu op de muispositie, binnen het scherm gehouden.
 * Sluit bij klik buiten het menu, Escape, scrollen of wisselen van venster.
 */
export function ContextMenu({
  x,
  y,
  entries,
  onClose,
}: {
  x: number;
  y: number;
  entries: MenuEntry[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Na het meten zo verschuiven dat het menu volledig zichtbaar is.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - height - 8));
    if (left !== pos.left || top !== pos.top) setPos({ left, top });
  }, [x, y, pos.left, pos.top]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    document.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
      document.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[80] min-w-52 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1 text-sm shadow-[var(--shadow-lg)]"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuList entries={entries} onClose={onClose} />
    </div>
  );
}

function MenuList({ entries, onClose }: { entries: MenuEntry[]; onClose: () => void }) {
  const [openSub, setOpenSub] = useState<number | null>(null);
  return (
    <>
      {entries.map((entry, index) => {
        if (entry.kind === "separator") {
          return <div key={index} role="separator" className="my-1 h-px bg-[var(--border)]" />;
        }
        if (entry.kind === "custom") {
          return <div key={index}>{entry.render(onClose)}</div>;
        }
        const hasChildren = Boolean(entry.children?.length);
        return (
          <div
            key={index}
            className="relative"
            onMouseEnter={() => setOpenSub(hasChildren ? index : null)}
          >
            <button
              type="button"
              role="menuitem"
              disabled={entry.disabled}
              aria-haspopup={hasChildren || undefined}
              aria-expanded={hasChildren ? openSub === index : undefined}
              onClick={() => {
                if (hasChildren) {
                  setOpenSub(openSub === index ? null : index);
                  return;
                }
                onClose();
                entry.onSelect?.();
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left hover:bg-[var(--bg-hover)] disabled:opacity-40 disabled:hover:bg-transparent",
                entry.danger ? "text-[var(--danger)]" : "text-[var(--text)]",
              )}
            >
              <span className="flex-1">{entry.label}</span>
              {entry.hint && <span className="kbd">{entry.hint}</span>}
              {hasChildren && <ChevronRight className="h-3.5 w-3.5 text-[var(--text-subtle)]" />}
            </button>
            {hasChildren && openSub === index && (
              <div
                role="menu"
                className="absolute top-0 left-full z-10 ml-1 max-h-72 min-w-48 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1 shadow-[var(--shadow-lg)]"
              >
                <MenuList entries={entry.children!} onClose={onClose} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
