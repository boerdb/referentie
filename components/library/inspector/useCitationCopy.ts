"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/api/client";
import { shareOrCopyText } from "@/lib/share/files";

export type CiteStyleId = "apa" | "mla" | "chicago";

/** Haalt een citaat op en zet het op het klembord (met share-sheet als laatste redmiddel op iOS). */
export function useCitationCopy() {
  const toast = useToast();
  const [citeCopied, setCiteCopied] = useState<string | null>(null);

  async function copyCitation(id: string, style: CiteStyleId) {
    const res = await api<{ citation?: string }>(`/api/cite/${id}?style=${style}`);
    if (!res.ok || !res.data.citation) {
      toast.error("Citaat ophalen mislukt", res.ok ? undefined : res.error);
      return;
    }
    const citation = res.data.citation;
    const label = style.toUpperCase();

    let copied = false;
    try {
      await navigator.clipboard.writeText(citation);
      copied = true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = citation;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      copied = document.execCommand("copy");
      ta.remove();
    }

    try {
      if (copied) {
        setCiteCopied(`${label} gekopieerd — plak waar je wilt`);
      } else {
        const result = await shareOrCopyText(citation, { title: `${label}-citaat` });
        setCiteCopied(result === "shared" ? `${label} gedeeld` : `${label} gekopieerd`);
      }
      window.setTimeout(() => setCiteCopied(null), 3500);
    } catch {
      toast.error("Citaat kopiëren mislukt");
    }
  }

  return { citeCopied, copyCitation };
}
