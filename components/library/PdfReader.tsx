"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toaster";
import {
  useAddHighlight,
  useAttachments,
  useHighlightActions,
  useHighlights,
} from "@/lib/library/hooks";
import type { ReferenceRecord } from "@/lib/references/types";
import { PdfViewer } from "./PdfViewer";

/** Welke bijlage en pagina getoond moeten worden (bijv. na klik op een markering). */
export type PdfFocus = { attachmentId: string | null; page: number; nonce: number } | null;

/**
 * PDF van een artikel met markeringen. Bij meerdere bijlagen kies je bovenin welke.
 * Gebruik `key={reference.id}` zodat de keuze per artikel opnieuw begint.
 */
export function PdfReader({ reference, focus }: { reference: ReferenceRecord; focus?: PdfFocus }) {
  const toast = useToast();
  const { data: attachments = [] } = useAttachments(reference.attachmentCount > 1 ? reference.id : null);
  const [chosen, setChosen] = useState<string | null>(null);
  const attachmentId = focus?.attachmentId ?? chosen ?? reference.attachmentId;
  const { data: highlights = [] } = useHighlights(attachmentId);
  const addHighlight = useAddHighlight();
  const { remove } = useHighlightActions(attachmentId);

  if (!attachmentId) return null;
  const url =
    attachmentId === reference.attachmentId
      ? `/api/references/${reference.id}/pdf`
      : `/api/attachments/${attachmentId}`;

  const header =
    attachments.length > 1 ? (
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-1.5">
        <span className="text-xs" style={{ color: "var(--pdf-chrome)" }}>
          Bijlage
        </span>
        <select
          value={attachmentId}
          onChange={(e) => setChosen(e.target.value)}
          aria-label="Bijlage kiezen"
          className="input min-w-0 flex-1 rounded-md px-2 py-1 text-xs"
        >
          {attachments.map((a, i) => (
            <option key={a.id} value={a.id}>
              {i === 0 ? "Hoofd-PDF" : a.label || a.name}
              {a.pageCount ? ` (${a.pageCount} p.)` : ""}
            </option>
          ))}
        </select>
      </div>
    ) : undefined;

  return (
    <PdfViewer
      key={attachmentId}
      url={url}
      title={reference.title}
      header={header}
      highlights={highlights}
      focus={focus && (!focus.attachmentId || focus.attachmentId === attachmentId) ? focus : null}
      onAddHighlight={(input) =>
        addHighlight.mutate(
          { attachmentId, ...input },
          { onError: (error) => toast.error("Markering niet opgeslagen", error.message) },
        )
      }
      onDeleteHighlight={(id) =>
        remove.mutate(id, { onError: (error) => toast.error("Verwijderen mislukt", error.message) })
      }
    />
  );
}
