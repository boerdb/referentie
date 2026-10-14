import { redisGet, redisSetEx } from "@/lib/redis";
import { cleanDoiForLookup } from "@/lib/doi/normalize";

const CACHE_TTL_SEC = 6 * 60 * 60;
const LOOKUP_MS = 15_000;
const PAGE_SIZE = 20;
const MAILTO = "support@clvs.nl";
const USER_AGENT = "ReferentiePWA/1.0 (mailto:support@clvs.nl)";

export type CitationDirection = "references" | "cited-by";

export type CitationHit = {
  doi: string | null;
  title: string;
  authors: string;
  year: number | null;
  journal: string | null;
};

export type CitationCounts = {
  references: number | null;
  citedBy: number | null;
};

export type CitationPage = {
  direction: CitationDirection;
  source: "crossref" | "openalex" | null;
  total: number;
  page: number;
  pageSize: number;
  note: string | null;
  counts: CitationCounts;
  items: CitationHit[];
};

type CrossrefReference = {
  DOI?: string;
  "article-title"?: string;
  author?: unknown;
  year?: string;
  "journal-title"?: string;
  unstructured?: string;
};

type OpenAlexAuthorship = { author?: { display_name?: string } };

type OpenAlexWork = {
  id?: string;
  doi?: string | null;
  display_name?: string;
  publication_year?: number | null;
  cited_by_count?: number;
  authorships?: OpenAlexAuthorship[];
  primary_location?: { source?: { display_name?: string } | null } | null;
};

type OpenAlexList = {
  meta?: { count?: number };
  results?: OpenAlexWork[];
};

type CrossrefCache = { reported: number; hits: CitationHit[] };
type OpenAlexIdentity = {
  id: string | null;
  citedByCount: number | null;
  referenceCount: number | null;
};

export function filterCitationHits(items: CitationHit[], query: string): CitationHit[] {
  const parts = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return items;
  return items.filter((item) => {
    const blob = [item.title, item.authors, item.journal, item.doi, item.year?.toString() ?? ""]
      .join(" ")
      .toLowerCase();
    return parts.every((part) => blob.includes(part));
  });
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value: string | null | undefined): string {
  if (!value) return "";
  return decodeEntities(value.replace(/<[^>]+>/g, " "));
}

function yearFrom(value: unknown): number | null {
  const year = typeof value === "number" ? value : Number(String(value ?? "").slice(0, 4));
  return Number.isInteger(year) && year > 1000 && year < 3000 ? year : null;
}

function doiFrom(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = cleanDoiForLookup(value);
  return cleaned.startsWith("10.") && cleaned.includes("/") ? cleaned : null;
}

function formatAuthors(names: string[]): string {
  const clean = names.map((name) => name.trim()).filter(Boolean);
  if (clean.length <= 3) return clean.join(", ");
  return `${clean.slice(0, 3).join(", ")} et al.`;
}

function authorFromCrossref(author: unknown): string {
  if (typeof author === "string") return cleanText(author);
  if (!Array.isArray(author)) return "";
  const names = author.map((entry) => {
    if (typeof entry === "string") return cleanText(entry);
    if (entry && typeof entry === "object") {
      const person = entry as { given?: string; family?: string; name?: string };
      return cleanText(person.name || [person.given, person.family].filter(Boolean).join(" "));
    }
    return "";
  });
  return formatAuthors(names);
}

function mapCrossrefReference(reference: CrossrefReference): CitationHit {
  const title =
    cleanText(reference["article-title"]) ||
    cleanText(reference.unstructured) ||
    "Zonder titel";
  return {
    doi: doiFrom(reference.DOI),
    title,
    authors: authorFromCrossref(reference.author),
    year: yearFrom(reference.year),
    journal: cleanText(reference["journal-title"]) || null,
  };
}

function mapOpenAlexWork(work: OpenAlexWork): CitationHit {
  const names = (work.authorships ?? [])
    .map((entry) => entry.author?.display_name ?? "")
    .filter(Boolean);
  return {
    doi: doiFrom(work.doi),
    title: cleanText(work.display_name) || "Zonder titel",
    authors: formatAuthors(names),
    year: yearFrom(work.publication_year),
    journal: cleanText(work.primary_location?.source?.display_name) || null,
  };
}

async function fetchText(url: string, headers: Record<string, string>): Promise<Response> {
  return fetch(url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(LOOKUP_MS),
    next: { revalidate: 0 },
  });
}

async function cachedGet<T>(key: string): Promise<T | null> {
  try {
    return await redisGet<T>(key);
  } catch (e) {
    console.warn("[citations-cache get]", e instanceof Error ? e.message : e);
    return null;
  }
}

async function cachedSet(key: string, value: unknown): Promise<void> {
  try {
    await redisSetEx(key, value, CACHE_TTL_SEC);
  } catch (e) {
    console.warn("[citations-cache set]", e instanceof Error ? e.message : e);
  }
}

async function loadCrossrefReferences(doi: string): Promise<CrossrefCache> {
  const key = `citations:crossref:${doi.toLowerCase()}`;
  const cached = await cachedGet<CrossrefCache>(key);
  if (cached) return cached;

  const res = await fetchText(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
    Accept: "application/json",
    "User-Agent": USER_AGENT,
  });
  if (res.status === 404) {
    const empty = { reported: 0, hits: [] };
    await cachedSet(key, empty);
    return empty;
  }
  if (!res.ok) throw new Error(`Crossref gaf HTTP ${res.status}.`);

  const json = (await res.json()) as {
    message?: { "reference-count"?: number; reference?: CrossrefReference[] };
  };
  const message = json.message;
  const hits = (message?.reference ?? []).slice(0, 500).map(mapCrossrefReference);
  const reported = message?.["reference-count"] ?? hits.length;
  const value = { reported, hits };
  await cachedSet(key, value);
  return value;
}

async function loadOpenAlexIdentity(doi: string): Promise<OpenAlexIdentity> {
  const key = `citations:openalex:${doi.toLowerCase()}`;
  const cached = await cachedGet<OpenAlexIdentity>(key);
  if (cached) return cached;

  const res = await fetchText(
    `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}?mailto=${MAILTO}&select=id,cited_by_count,referenced_works_count`,
    { Accept: "application/json", "User-Agent": USER_AGENT },
  );
  if (res.status === 404) {
    const empty = { id: null, citedByCount: null, referenceCount: null };
    await cachedSet(key, empty);
    return empty;
  }
  if (!res.ok) throw new Error(`OpenAlex gaf HTTP ${res.status}.`);

  const work = (await res.json()) as OpenAlexWork & { referenced_works_count?: number };
  const id = work.id?.split("/").pop() ?? null;
  const value = {
    id,
    citedByCount: typeof work.cited_by_count === "number" ? work.cited_by_count : null,
    referenceCount:
      typeof work.referenced_works_count === "number" ? work.referenced_works_count : null,
  };
  await cachedSet(key, value);
  return value;
}

async function loadOpenAlexPage(
  doi: string,
  filter: string,
  page: number,
  query: string,
  sort: string | null,
): Promise<{ total: number; items: CitationHit[] }> {
  const key = `citations:oa-page:${doi.toLowerCase()}:${filter}:${page}:${query.toLowerCase()}`;
  const cached = await cachedGet<{ total: number; items: CitationHit[] }>(key);
  if (cached) return cached;

  const params = new URLSearchParams({
    filter,
    page: String(page),
    per_page: String(PAGE_SIZE),
    mailto: MAILTO,
    select: "id,doi,display_name,publication_year,authorships,primary_location",
  });
  if (query) params.set("search", query);
  else if (sort) params.set("sort", sort);

  const res = await fetchText(`https://api.openalex.org/works?${params}`, {
    Accept: "application/json",
    "User-Agent": USER_AGENT,
  });
  if (!res.ok) throw new Error(`OpenAlex gaf HTTP ${res.status}.`);
  const json = (await res.json()) as OpenAlexList;
  const value = {
    total: json.meta?.count ?? 0,
    items: (json.results ?? []).map(mapOpenAlexWork),
  };
  await cachedSet(key, value);
  return value;
}

function slicePage(items: CitationHit[], page: number): CitationHit[] {
  const start = (page - 1) * PAGE_SIZE;
  return items.slice(start, start + PAGE_SIZE);
}

export async function fetchCitations(
  doiRaw: string,
  options: { direction: CitationDirection; page: number; query: string },
): Promise<CitationPage> {
  const doi = cleanDoiForLookup(doiRaw);
  if (!doi.startsWith("10.") || !doi.includes("/")) {
    throw new Error("Ongeldige DOI.");
  }

  const page = Math.min(100, Math.max(1, options.page));
  const query = options.query.trim().slice(0, 200);
  const [crossref, identity] = await Promise.all([
    loadCrossrefReferences(doi),
    loadOpenAlexIdentity(doi),
  ]);
  const counts: CitationCounts = {
    references: crossref.hits.length > 0 ? crossref.hits.length : identity.referenceCount,
    citedBy: identity.citedByCount,
  };

  if (options.direction === "cited-by") {
    if (!identity.id) {
      return {
        direction: "cited-by",
        source: null,
        total: 0,
        page,
        pageSize: PAGE_SIZE,
        note: "OpenAlex kent dit artikel niet, dus citaties zijn niet op te zoeken.",
        counts,
        items: [],
      };
    }
    const listed = await loadOpenAlexPage(
      doi,
      `cites:${identity.id}`,
      page,
      query,
      "publication_date:desc",
    );
    return {
      direction: "cited-by",
      source: "openalex",
      total: listed.total,
      page,
      pageSize: PAGE_SIZE,
      note: null,
      counts,
      items: listed.items,
    };
  }

  if (crossref.hits.length > 0) {
    const filtered = filterCitationHits(crossref.hits, query);
    const truncated = crossref.reported > crossref.hits.length;
    return {
      direction: "references",
      source: "crossref",
      total: filtered.length,
      page,
      pageSize: PAGE_SIZE,
      note: truncated
        ? `Crossref meldt ${crossref.reported} bronnen; ${crossref.hits.length} zijn uitgelezen.`
        : null,
      counts,
      items: slicePage(filtered, page),
    };
  }

  if (!identity.id) {
    return {
      direction: "references",
      source: null,
      total: 0,
      page,
      pageSize: PAGE_SIZE,
      note: "Geen bronnenlijst gevonden bij Crossref of OpenAlex.",
      counts,
      items: [],
    };
  }

  const listed = await loadOpenAlexPage(doi, `cited_by:${identity.id}`, page, query, null);
  return {
    direction: "references",
    source: "openalex",
    total: listed.total,
    page,
    pageSize: PAGE_SIZE,
      note: null,
      counts,
      items: listed.items,
  };
}
