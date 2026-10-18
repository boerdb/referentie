"use client";

import { useState } from "react";
import { ExternalLink, Loader2, Search } from "lucide-react";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/api/client";
import { useInvalidateLibrary, useReplaceReference } from "@/lib/library/hooks";
import type { ReferenceRecord } from "@/lib/references/types";

type FindResponse = {
  found: boolean;
  doi: string | null;
  doiAdded: boolean;
  links?: { label: string; url: string }[];
  item?: ReferenceRecord;
};

/** Zoekt online een vrij beschikbare PDF; lukt dat niet, dan links om zelf te zoeken. */
export function useFindPdf() {
  const toast = useToast();
  const replace = useReplaceReference();
  const invalidate = useInvalidateLibrary();
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<FindResponse["links"] | null>(null);

  async function findPdf(reference: ReferenceRecord) {
    setBusy(true);
    setLinks(null);
    const res = await api<FindResponse>(`/api/references/${reference.id}/find-pdf`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      toast.error("PDF zoeken mislukt", res.error);
      return;
    }
    if (res.data.item) replace(res.data.item);
    void invalidate();
    if (res.data.found) {
      toast.success(
        "PDF gevonden en gekoppeld",
        res.data.doiAdded ? `DOI ${res.data.doi} is ook toegevoegd.` : "Vrij beschikbare versie (open access).",
      );
    } else {
      setLinks(res.data.links ?? []);
      toast.info(
        "Geen vrij beschikbare PDF gevonden",
        res.data.doiAdded ? `Wel de DOI gevonden en toegevoegd: ${res.data.doi}` : "Probeer een van de links hieronder.",
      );
    }
  }

  return { busy, links, findPdf };
}

export function FindPdfPanel({ reference, onUpload }: { reference: ReferenceRecord; onUpload: () => void }) {
  const { busy, links, findPdf } = useFindPdf();

  return (
    <div className="rounded-lg border border-dashed border-[var(--border-strong)] p-3">
      <p className="text-sm font-medium">Nog geen PDF gekoppeld</p>
      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
        Zoek een vrij beschikbare versie via OpenAlex, Unpaywall en Europe PMC
        {reference.doi ? "." : ", eerst de DOI op titel."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void findPdf(reference)}
          className="btn-primary inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs max-lg:min-h-10"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          {busy ? "Zoeken…" : "PDF online zoeken"}
        </button>
        <button
          type="button"
          onClick={onUpload}
          className="btn-secondary inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs max-lg:min-h-10"
        >
          PDF uploaden
        </button>
      </div>
      {links && links.length > 0 && (
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <p className="text-xs text-[var(--text-muted)]">
            Zelf zoeken; download de PDF en sleep hem op de bibliotheek of gebruik &quot;PDF uploaden&quot;:
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {links.map((link) => (
              <li key={link.url}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-subtle)] px-2 py-1 text-xs font-medium text-[var(--accent)] ring-1 ring-[var(--border)] hover:underline"
                >
                  {link.label} <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
