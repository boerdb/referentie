"use client";

import { useEffect, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Globe, Loader2, Menu, Plus, Search } from "lucide-react";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/api/client";
import { libraryKeys } from "@/lib/library/hooks";
import { SEARCH_SOURCES, type SearchHit, type SearchSource } from "@/lib/search/literature";
import { cn } from "@/lib/utils";

type Hit = SearchHit & { inLibrary: boolean; libraryId: string | null };
type Page = { total: number; nextCursor: string | null; items: Hit[] };

const MIN_CHARS = 3;

/**
 * Zoeken in PubMed, Europe PMC, OpenAlex of Crossref, binnen de bibliotheek (zoals de online
 * bronnen in Bookends). De zoekterm komt uit de werkbalk; op de telefoon uit het eigen veld.
 */
export function OnlineSearch({
  source,
  query,
  onQueryChange,
  onOpenInLibrary,
  onOpenMenu,
}: {
  source: SearchSource;
  query: string;
  onQueryChange: (q: string) => void;
  onOpenInLibrary: (id: string) => void;
  onOpenMenu: () => void;
}) {
  const toast = useToast();
  const client = useQueryClient();
  const [debounced, setDebounced] = useState(query.trim());
  const [added, setAdded] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const meta = SEARCH_SOURCES.find((s) => s.id === source)!;

  // Rustiger dan in de eigen bibliotheek: externe bronnen hebben een limiet.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 600);
    return () => clearTimeout(t);
  }, [query]);

  const search = useInfiniteQuery({
    queryKey: ["online", source, debounced],
    enabled: debounced.length >= MIN_CHARS,
    initialPageParam: "",
    staleTime: 5 * 60_000,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ source, q: debounced, cursor: pageParam });
      const res = await api<Page>(`/api/search?${params}`);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const hits = search.data?.pages.flatMap((p) => p.items) ?? [];
  const total = search.data?.pages[0]?.total ?? 0;

  async function add(hit: Hit) {
    setAdding(hit.id);
    const res = hit.doi
      ? await api<{ item?: { id: string } }>("/api/doi", { method: "POST", body: { doi: hit.doi, save: true } })
      : await api<{ item?: { id: string } }>("/api/references", {
          method: "POST",
          body: {
            title: hit.title,
            year: hit.year,
            journal: hit.journal,
            pmid: hit.pmid,
            url: hit.url,
            authors: hit.authors ? [{ familyName: hit.authors, givenName: "" }] : [],
          },
        });
    setAdding(null);
    if (!res.ok || !res.data.item) {
      toast.error("Toevoegen mislukt", res.ok ? undefined : res.error);
      return;
    }
    const id = res.data.item.id;
    setAdded((prev) => ({ ...prev, [hit.id]: id }));
    void client.invalidateQueries({ queryKey: libraryKeys.references });
    toast.show({
      kind: "success",
      message: "Toegevoegd aan je bibliotheek",
      description: hit.title.slice(0, 80),
      action: { label: "Openen", onClick: () => onOpenInLibrary(id) },
    });
  }

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg-panel)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 lg:h-10 lg:px-4 lg:py-0">
        <button
          type="button"
          className="btn-ghost -ml-1 grid h-11 w-11 shrink-0 place-items-center rounded-lg lg:hidden"
          aria-label="Menu"
          onClick={onOpenMenu}
        >
          <Menu className="h-5 w-5" />
        </button>
        <Globe className="hidden h-4 w-4 text-[var(--text-subtle)] lg:block" />
        <h2 className="truncate text-sm font-semibold tracking-tight">{meta.label}</h2>
        <span className="truncate text-xs text-[var(--text-muted)]">
          {search.isFetching && !search.isFetchingNextPage
            ? "Zoeken…"
            : debounced.length >= MIN_CHARS && search.data
              ? `${total.toLocaleString("nl-NL")} resultaten`
              : meta.hint}
        </span>
      </div>
      <div className="relative border-b border-[var(--border)] p-3 lg:hidden">
        <Search className="pointer-events-none absolute top-1/2 left-6 h-4 w-4 -translate-y-1/2 text-[var(--text-subtle)]" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={`Zoek in ${meta.label}`}
          className="input h-11 w-full rounded-lg pr-3 pl-9"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {debounced.length < MIN_CHARS ? (
          <p className="px-6 py-14 text-center text-sm text-[var(--text-muted)]">
            Typ een zoekterm in de werkbalk (minstens {MIN_CHARS} tekens), bijv. &quot;septic shock
            vasopressin&quot;.
          </p>
        ) : search.isError ? (
          <p className="px-6 py-14 text-center text-sm text-[var(--danger)]">{search.error.message}</p>
        ) : search.isPending ? (
          <p className="px-6 py-14 text-center text-sm text-[var(--text-muted)]">Zoeken in {meta.label}…</p>
        ) : hits.length === 0 ? (
          <p className="px-6 py-14 text-center text-sm text-[var(--text-muted)]">Niets gevonden.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {hits.map((hit) => {
              const libraryId = added[hit.id] ?? hit.libraryId;
              return (
                <li key={hit.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug font-medium">{hit.title}</p>
                    <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                      {[hit.authors, hit.year, hit.journal].filter(Boolean).join(" · ")}
                    </p>
                    <p className="mt-1 flex flex-wrap gap-x-3 text-xs">
                      {hit.doi && <span className="font-mono text-[var(--text-subtle)]">{hit.doi}</span>}
                      {hit.url && (
                        <a
                          href={hit.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-[var(--accent)] hover:underline"
                        >
                          Bij de bron <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </p>
                  </div>
                  {libraryId ? (
                    <button
                      type="button"
                      onClick={() => onOpenInLibrary(libraryId)}
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium max-lg:min-h-10",
                        "bg-[var(--accent-soft)] text-[var(--accent)]",
                      )}
                    >
                      <Check className="h-3.5 w-3.5" /> In bibliotheek
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={adding === hit.id}
                      onClick={() => void add(hit)}
                      className="btn-secondary inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs max-lg:min-h-10"
                    >
                      {adding === hit.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      Toevoegen
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {search.hasNextPage && (
          <div className="p-4 text-center">
            <button
              type="button"
              disabled={search.isFetchingNextPage}
              onClick={() => void search.fetchNextPage()}
              className="btn-secondary rounded-lg px-3.5 py-1.5 text-sm"
            >
              {search.isFetchingNextPage ? "Laden…" : "Meer resultaten"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
