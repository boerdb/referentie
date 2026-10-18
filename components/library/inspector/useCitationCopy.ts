"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/api/client";
import { usePref } from "@/lib/library/prefs";
import { CSL_STYLES, type CslStyleId } from "@/lib/cite/styles";
import { copyRichText, shareOrCopyText } from "@/lib/share/files";

export type CiteStyleId = CslStyleId;

/** Gekozen citeerstijl, per browser onthouden. Vancouver past bij medische tijdschriften. */
export function useCiteStyle() {
  return usePref<CslStyleId>("citeStyle", "vancouver");
}

/** Haalt een citaat of bibliografie op en zet het opgemaakt op het klembord. */
export function useCitationCopy() {
  const toast = useToast();
  const [style] = useCiteStyle();
  const [citeCopied, setCiteCopied] = useState<string | null>(null);

  async function copy(html: string, text: string, label: string) {
    const copied = await copyRichText(html, text);
    if (copied) {
      setCiteCopied(`${label} gekopieerd — plak waar je wilt`);
    } else {
      // Laatste redmiddel op iOS: share-sheet met de platte tekst.
      const result = await shareOrCopyText(text, { title: label });
      setCiteCopied(result === "shared" ? `${label} gedeeld` : `${label} gekopieerd`);
    }
    window.setTimeout(() => setCiteCopied(null), 3500);
  }

  async function copyCitation(id: string, styleId: CslStyleId = style) {
    const res = await api<{ citation?: string; html?: string }>(`/api/cite/${id}?style=${styleId}`);
    if (!res.ok || !res.data.citation) {
      toast.error("Citaat ophalen mislukt", res.ok ? undefined : res.error);
      return;
    }
    await copy(res.data.html ?? res.data.citation, res.data.citation, CSL_STYLES[styleId].label);
  }

  /** Bibliografie van een selectie, in de volgorde van de lijst. */
  async function copyBibliography(ids: string[], styleId: CslStyleId = style) {
    const res = await api<{ text: string; html: string; entries: string[] }>("/api/cite", {
      method: "POST",
      body: { ids, style: styleId },
    });
    if (!res.ok) {
      toast.error("Bibliografie maken mislukt", res.error);
      return;
    }
    const copied = await copyRichText(res.data.html, res.data.text);
    if (copied) {
      toast.success(
        `Bibliografie gekopieerd (${CSL_STYLES[styleId].label})`,
        `${res.data.entries.length} bronnen — plak in Word, Pages of een e-mail.`,
      );
    } else {
      await shareOrCopyText(res.data.text, { title: "Bibliografie" });
    }
  }

  return { citeCopied, copyCitation, copyBibliography, style };
}
