import { BookMarked } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--accent)] text-[var(--accent-fg)] shadow-sm",
        className,
      )}
      aria-hidden
    >
      <BookMarked className="h-4 w-4" strokeWidth={2.25} />
    </span>
  );
}
