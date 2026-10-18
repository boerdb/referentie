"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Loader2, Plus, Search } from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";
import { SEARCH_SOURCES, type SearchHit, type SearchSource } from "@/lib/search/literature";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { useToast } from "@/components/ui/Toaster";

type Hit = SearchHit & { inLibrary: boolean; libraryId: string | null };

type SearchResponse = {
  error?: string;
  total?: number;
  nextCursor?: string | null;
  items?: Hit[];
};

export function LiteratureSearch() {
  const toast = useToast();
  const [source, setSource] = useState<SearchSource>("pubmed");
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [items, setItems] = useState<Hit[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  const hint = useMemo(
    () => SEARCH_SOURCES.find((entry) => entry.id === source)?.hint ?? "",
    [source],
  );

  async function runSearch(cursor: string, append: boolean) {
    const q = (append ? submitted : query).trim();
    if (q.length < 2) {
      setError("Typ minstens twee tekens.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ source, q, cursor });
      const res = await fetch(`/api/search?${params}`, { credentials: "include" });
      const data = (await res.json()) as SearchResponse;
      if (!res.ok) {
        setError(data.error ?? "Zoeken mislukt.");
        if (!append) setItems([]);
        return;
      }
      setSubmitted(q);
      setItems((prev) => (append ? [...prev, ...(data.items ?? [])] : (data.items ?? [])));
      setTotal(data.total ?? 0);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      setError("Zoeken mislukt — geen verbinding.");
    } finally {
      setLoading(false);
    }
  }

  async function addHit(hit: Hit) {
    setAddingId(hit.id);
    const res = hit.doi
      ? await api<{ item?: { id: string } }>("/api/doi", {
          method: "POST",
          body: { doi: hit.doi, save: true },
        })
      : await api<{ item?: { id: string } }>("/api/references", {
          method: "POST",
          body: {
            title: hit.title,
            year: hit.year,
            journal: hit.journal,
            doi: null,
            pmid: hit.pmid,
            url: hit.url,
            authors: hit.authors ? [{ familyName: hit.authors, givenName: "" }] : [],
          },
        });
    setAddingId(null);
    if (!res.ok || !res.data.item) {
      toast.error("Toevoegen mislukt", res.ok ? undefined : res.error);
      return;
    }
    const libraryId = res.data.item.id;
    setItems((prev) =>
      prev.map((item) => (item.id === hit.id ? { ...item, inLibrary: true, libraryId } : item)),
    );
    toast.success("Toegevoegd aan de bibliotheek");
  }

  return (
    <div className="min-h-dvh overflow-x-clip bg-[var(--bg-page)]">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg-panel)] pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-2.5 px-4">
          <Link
            href="/bibliotheek"
            className="btn-ghost inline-flex h-11 items-center gap-1 rounded-lg pr-2 pl-1 text-sm font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Bibliotheek</span>
          </Link>
          <BrandMark className="h-7 w-7 rounded-md [&>svg]:h-3.5 [&>svg]:w-3.5" />
          <h1 className="min-w-0 truncate text-[0.9375rem] font-semibold tracking-tight">
            Literatuur zoeken
          </h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <p className="max-w-xl text-sm leading-relaxed text-[var(--text-muted)]">
          Zoek een artikel en voeg het toe aan je bibliotheek. Bij een DOI wordt een vrij
          beschikbare PDF meteen meegenomen.
        </p>

        <form
          className="mt-5 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch("", false);
          }}
        >
          <label className="block">
            <span className="section-label mb-1.5 block">Bron</span>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as SearchSource)}
              className="input h-11 w-full rounded-lg px-3 text-sm"
            >
              {SEARCH_SOURCES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
            <span className="mt-1.5 block text-xs text-[var(--text-muted)]">{hint}</span>
          </label>

          <label className="block">
            <span className="sr-only">Zoekterm</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-subtle)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Titel, auteur, onderwerp of DOI"
                className="input h-11 w-full rounded-lg pr-3 pl-9 text-base sm:text-sm"
              />
            </span>
          </label>

          <button
            type="submit"
            disabled={loading || query.trim().length < 2}
            className="btn-primary inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm"
          >
            {loading && !items.length ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Zoeken
          </button>
        </form>

        {error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}

        {submitted && !error && (
          <p className="mt-6 text-xs text-[var(--text-muted)]">
            {total.toLocaleString("nl-NL")} treffers in{" "}
            {SEARCH_SOURCES.find((entry) => entry.id === source)?.label}
          </p>
        )}

        {submitted && !loading && !error && items.length === 0 && (
          <p className="mt-3 text-sm text-[var(--text-muted)]">Geen treffers voor deze zoekterm.</p>
        )}

        {items.length > 0 && (
          <ul className="card mt-3 divide-y divide-[var(--border)]">
            {items.map((item) => (
              <li key={item.id} className="min-w-0 px-4 py-4">
                <p className="font-serif text-[1.02rem] leading-snug font-semibold [overflow-wrap:anywhere]">
                  {item.title}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)] [overflow-wrap:anywhere]">
                  {[item.authors, item.year, item.journal].filter(Boolean).join(" · ")}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-ghost inline-flex h-10 items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 text-xs"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Bron
                    </a>
                  )}
                  {item.inLibrary ? (
                    <span className="inline-flex h-10 items-center rounded-lg bg-[var(--accent-soft)] px-2.5 text-xs font-medium text-[var(--accent)]">
                      In bibliotheek
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={addingId === item.id}
                      onClick={() => void addHit(item)}
                      className={cn(
                        "btn-secondary inline-flex h-10 items-center gap-1 rounded-lg px-2.5 text-xs",
                      )}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {addingId === item.id ? "Toevoegen…" : "Toevoegen"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {nextCursor && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void runSearch(nextCursor, true)}
            className="btn-secondary mt-4 inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Meer laden
          </button>
        )}
      </main>
    </div>
  );
}
