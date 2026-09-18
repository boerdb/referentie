"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "system", label: "Systeem", icon: Monitor },
  { value: "light", label: "Licht", icon: Sun },
  { value: "dark", label: "Donker", icon: Moon },
] as const;

type ThemeValue = (typeof OPTIONS)[number]["value"];

type Props = {
  /** Volledige knoppen met label (instellingen) */
  variant?: "full" | "icons";
};

export function ThemeSelector({ variant = "full" }: Props) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div
        className={cn(
          "animate-pulse rounded-lg bg-[var(--accent-soft)]",
          variant === "full" ? "h-10 w-full max-w-sm" : "h-9 w-[7.5rem]",
        )}
      />
    );
  }

  const current: ThemeValue =
    theme === "light" || theme === "dark" || theme === "system" ? theme : "system";

  return (
    <div
      className={cn(
        "flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1",
        variant === "full" ? "w-full max-w-sm" : "shrink-0",
      )}
      role="group"
      aria-label="Thema"
    >
      {OPTIONS.map((opt) => {
        const active = current === opt.value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            title={opt.label}
            aria-pressed={active}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md text-xs font-medium transition",
              variant === "full" ? "flex-1 px-2 py-2" : "px-2.5 py-2 max-lg:min-h-11 max-lg:min-w-11",
              active
                ? "bg-[var(--accent-soft)] text-[var(--accent)] shadow-sm"
                : "text-[var(--text-muted)] hover:bg-[var(--accent-soft)]/50 hover:text-[var(--text)]",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {variant === "full" && <span>{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
