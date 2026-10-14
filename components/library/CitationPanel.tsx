"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ExternalLink, Loader2, Plus, Search } from "lucide-react";
import type { CitationCounts, CitationDirection } from "@/lib/doi/citations";
import { cn } from "@/lib/utils";

type Hit = {
  doi: string | null;
  title: string;
  authors: string;
  year: number | null;
  journal: string | null;
  inLibrary: boolean;
  libraryId: string | null;
};

type PageResponse = {
  error?: string;
  source: "crossref" | "openalex" | null;
  total: number;
  page: number;
  pageSize: number;
  note: string | null;
  counts: CitationCounts;
  items: Hit[];
};

type Props = {
  referenceId: string;
  doi: string | null;
  onOpenInLibrary: (id: string) => void;
  onAdded: () => void;
};

const emptyCounts: CitationCounts = { references: null, citedBy: null };

export function CitationPanel({ referenceId, doi, onOpenInLibrary, onAdded }: Props) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<CitationDirection>("references");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [items, setItems] = useState<Hit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [counts, setCounts] = useState<CitationCounts>(emptyCounts);
  const [note, setNote] = useState<string | null>(null);
  const [source, setSource] = useState<PageResponse["source"]>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingDoi, setAddingDoi] = useState<string | null>(null);
  const requestGen = useRef(0);
  const skipFetch = useRef(false);

  useEffect(() => {
    skipFetch.current = true;
    requestGen.current += 1;
    setOpen(false);
    setDirection("references");
    setQuery("");
    setDebouncedQuery("");
    setItems([]);
    setTotal(0);
    setPage(1);
    setCounts(emptyCounts);
    setNote(null);
    setSource(null);
    setError(null);
    setLoading(false);
  }, [referenceId]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const loadPage = useCallback(
    async (nextPage: number, append: boolean) => {
      const gen = ++requestGen.current;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          direction,
          page: String(nextPage),
          q: debouncedQuery,
        });
        const res = await fetch(`/api/references/${referenceId}/citations?${params}`, {
          credentials: "include",
        });
        const data = (await res.json()) as PageResponse;
        if (gen !== requestGen.current) return;
        if (!res.ok) {
          setError(data.error ?? "Kruisverwijzingen ophalen mislukt.");
          if (!append) setItems([]);
          return;
        }
        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setTotal(data.total);
        setPage(data.page);
        setPageSize(data.pageSize);
        setCounts(data.counts);
        setNote(data.note);
        setSource(data.source);
      } catch {
        if (gen !== requestGen.current) return;
        setError("Kruisverwijzingen ophalen mislukt — geen verbinding.");
      } finally {
        if (gen === requestGen.current) setLoading(false);
      }
    },
    [direction, debouncedQuery, referenceId],
  );

  useEffect(() => {
    if (!open) {
      skipFetch.current = false;
      return;
    }
    if (skipFetch.current) {
      skipFetch.current = false;
      return;
    }
    void loadPage(1, false);
  }, [open, loadPage]);

  async function addHit(hitDoi: string) {
    setAddingDoi(hitDoi);
    try {
      const res = await fetch("/api/doi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ doi: hitDoi, save: true }),
      });
      const data = (await res.json()) as { error?: string; item?: { id: string } };
      if (!res.ok || !data.item) {
        alert(data.error ?? "Toevoegen mislukt");
        return;
      }
      setItems((prev) =>
        prev.map((item) =>
          item.doi === hitDoi ? { ...item, inLibrary: true, libraryId: data.item?.id ?? null } : item,
        ),
      );
      onAdded();
    } catch {
      alert("Toevoegen mislukt — geen verbinding.");
    } finally {
      setAddingDoi(null);
    }
  }

  const hasMore = page * pageSize < total;
  const sourceLabel =
    source === "crossref" ? "Bronnenlijst van de uitgever via Crossref." : source === "openalex" ? "Gevonden via OpenAlex." : null;

  function tabLabel(value: CitationDirection, text: string, count: number | null) {
    return `${text}${count != null ? ` (${count})` : ""}`;
  }

  return (
    <div>
      <button
        type="button"
        className="btn-secondary inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs max-lg:min-h-10"
        disabled={!doi}
        aria-expanded={open}
        title={doi ? "Bronnenlijst en citaties zoeken" : "Vul eerst een DOI in"}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        {open ? "Verbergen" : "Bronnenlijst en citaties tonen"}
      </button>
      {!doi && (
        <p className="mt-2 text-xs text-[var(--text-subtle)]">
          Beschikbaar zodra het artikel een DOI heeft.
        </p>
      )}

      {open && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--bg-subtle)] p-1" role="tablist">
            {(
              [
                ["references", "Bronnenlijst", counts.references],
                ["cited-by", "Geciteerd door", counts.citedBy],
              ] as const
            ).map(([value, text, count]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={direction === value}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition max-lg:min-h-10",
                  direction === value
                    ? "bg-[var(--bg-panel)] text-[var(--text)] shadow-sm ring-1 ring-[var(--border)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]",
                )}
                onClick={() => setDirection(value)}
              >
                {tabLabel(value, text, count)}
              </button>
            ))}
          </div>

          <label className="relative block">
            <span className="sr-only">Zoek in kruisverwijzingen</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-subtle)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Zoek op titel, auteur, jaar of DOI"
              className="input w-full rounded-lg py-2 pr-3 pl-9 text-sm"
            />
          </label>

          {sourceLabel && <p className="text-xs text-[var(--text-muted)]">{sourceLabel}</p>}
          {note && <p className="text-xs text-[var(--text-muted)]">{note}</p>}
          {debouncedQuery && !loading && !error && (
            <p className="text-xs text-[var(--text-muted)]">{total} treffers</p>
          )}
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

          {!error && !loading && items.length === 0 && (debouncedQuery || !note) && (
            <p className="text-sm text-[var(--text-muted)]">
              {debouncedQuery
                ? "Geen treffers voor deze zoekterm."
                : direction === "cited-by"
                  ? "Nog geen citaties gevonden."
                  : "Geen bronnenlijst gevonden."}
            </p>
          )}

          {items.length > 0 && (
            <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)]">
              {items.map((item, index) => (
                <li key={`${item.doi ?? "row"}-${index}`} className="min-w-0 px-3 py-2.5">
                  <p className="text-sm leading-snug [overflow-wrap:anywhere]">{item.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)] [overflow-wrap:anywhere]">
                    {[item.authors, item.year, item.journal].filter(Boolean).join(" · ")}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {item.inLibrary && item.libraryId && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-soft)] px-2 py-1 text-xs font-medium text-[var(--accent)] hover:underline max-lg:min-h-10"
                        onClick={() => onOpenInLibrary(item.libraryId as string)}
                      >
                        <Check className="h-3 w-3" />
                        In bibliotheek
                      </button>
                    )}
                    {item.doi && !item.inLibrary && (
                      <button
                        type="button"
                        className="btn-secondary inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs max-lg:min-h-10"
                        disabled={addingDoi === item.doi}
                        onClick={() => void addHit(item.doi as string)}
                      >
                        <Plus className="h-3 w-3" />
                        {addingDoi === item.doi ? "Toevoegen…" : "Toevoegen"}
                      </button>
                    )}
                    {item.doi && (
                      <a
                        href={`https://doi.org/${item.doi}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-ghost inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs max-lg:min-h-10"
                      >
                        <ExternalLink className="h-3 w-3" />
                        doi.org
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {loading && (
            <p className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Ophalen…
            </p>
          )}

          {hasMore && !error && (
            <button
              type="button"
              className="btn-secondary w-full rounded-md px-3 py-1.5 text-xs max-lg:min-h-10"
              disabled={loading}
              onClick={() => void loadPage(page + 1, true)}
            >
              Meer laden
            </button>
          )}
        </div>
      )}
    </div>
  );
}
