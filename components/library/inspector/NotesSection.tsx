"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/api/client";
import { registerNoteFlush } from "@/lib/library/note-flush";
import { cn } from "@/lib/utils";
import { DetailSection } from "../shared";

type NoteStatus = "loading" | "idle" | "saving" | "saved" | "error";

const STATUS_LABEL: Record<NoteStatus, string> = {
  loading: "Laden…",
  idle: "Wordt automatisch opgeslagen",
  saving: "Opslaan…",
  saved: "Opgeslagen",
  error: "Niet opgeslagen — probeer het opnieuw",
};

/**
 * Notitie van één artikel, met autosave. Gebruik `key={referenceId}`: bij een ander artikel
 * komt er een nieuwe instantie, en de oude schrijft bij het verdwijnen zijn laatste wijziging weg.
 */
export function NotesSection({ referenceId }: { referenceId: string }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<NoteStatus>("loading");
  /** Laatst opgeslagen tekst; `null` zolang de notitie nog niet geladen is. */
  const saved = useRef<string | null>(null);
  const latest = useRef("");

  useEffect(() => {
    let cancelled = false;
    void api<{ note?: { body: string } | null }>(`/api/references/${referenceId}/notes`).then(
      (res) => {
        if (cancelled) return;
        const body = res.ok ? (res.data.note?.body ?? "") : "";
        saved.current = body;
        latest.current = body;
        setNote(body);
        setStatus(res.ok ? "idle" : "error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [referenceId]);

  const persist = useCallback(async () => {
    const body = latest.current;
    if (saved.current === null || body === saved.current) return;
    setStatus("saving");
    const res = await api(`/api/references/${referenceId}/notes`, {
      method: "POST",
      body: { body },
    });
    if (!res.ok) {
      setStatus("error");
      toast.error("Notitie niet opgeslagen", res.error);
      return;
    }
    saved.current = body;
    setStatus("saved");
  }, [referenceId, toast]);

  // Automatisch opslaan, 800 ms na de laatste toetsaanslag.
  useEffect(() => {
    if (saved.current === null || note === saved.current) return;
    const timer = setTimeout(() => void persist(), 800);
    return () => clearTimeout(timer);
  }, [note, persist]);

  // Wegschrijven bij uitloggen, bij wisselen van artikel (unmount) en bij sluiten van het tabblad.
  useEffect(() => {
    const unregister = registerNoteFlush(persist);
    function onPageHide() {
      if (saved.current === null || latest.current === saved.current) return;
      navigator.sendBeacon(
        `/api/references/${referenceId}/notes`,
        new Blob([JSON.stringify({ body: latest.current })], { type: "application/json" }),
      );
    }
    window.addEventListener("pagehide", onPageHide);
    return () => {
      unregister();
      window.removeEventListener("pagehide", onPageHide);
      void persist();
    };
  }, [persist, referenceId]);

  return (
    <DetailSection title="Notities">
      <textarea
        value={note}
        disabled={status === "loading"}
        onChange={(e) => {
          latest.current = e.target.value;
          setNote(e.target.value);
        }}
        onBlur={() => void persist()}
        rows={6}
        aria-label="Notities"
        className="input w-full min-w-0 max-w-full rounded-lg px-3 py-2 text-sm leading-relaxed"
        placeholder="Schrijf je notities in Markdown…"
      />
      <p
        className={cn(
          "mt-1.5 text-right text-xs",
          status === "error" ? "text-[var(--danger)]" : "text-[var(--text-subtle)]",
        )}
        role="status"
      >
        {STATUS_LABEL[status]}
      </p>
    </DetailSection>
  );
}
