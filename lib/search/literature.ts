import { cleanDoiForLookup } from "@/lib/doi/normalize";

const PAGE_SIZE = 15;
const LOOKUP_MS = 12_000;
const MAILTO = "support@clvs.nl";
const USER_AGENT = "ReferentiePWA/1.0 (mailto:support@clvs.nl)";

export const SEARCH_SOURCES = [
  { id: "pubmed", label: "PubMed", hint: "Biomedische literatuur via NCBI" },
  { id: "europepmc", label: "Europe PMC", hint: "Europese index van artikelen en preprints" },
  { id: "openalex", label: "OpenAlex", hint: "Open catalogus van wetenschappelijke werken" },
  { id: "crossref", label: "Crossref", hint: "Uitgeversmetadata en DOI-records" },
] as const;

export type SearchSource = (typeof SEARCH_SOURCES)[number]["id"];

export type SearchHit = {
  id: string;
  title: string;
  authors: string;
  year: number | null;
  journal: string | null;
  doi: string | null;
  pmid: string | null;
  url: string | null;
};

export type SearchResult = {
  source: SearchSource;
  total: number;
  nextCursor: string | null;
  items: SearchHit[];
};

export function isSearchSource(value: string): value is SearchSource {
  return SEARCH_SOURCES.some((source) => source.id === value);
}

function decodeText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
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

function yearFrom(value: unknown): number | null {
  const match = String(value ?? "").match(/\d{4}/);
  if (!match) return null;
  const year = Number(match[0]);
  return year > 1000 && year < 3000 ? year : null;
}

function formatNames(names: string[]): string {
  const clean = names.map((name) => decodeText(name)).filter(Boolean);
  if (clean.length <= 3) return clean.join(", ");
  return `${clean.slice(0, 3).join(", ")} et al.`;
}

function doiFrom(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = cleanDoiForLookup(value.replace(/^doi:\s*/i, ""));
  return cleaned.startsWith("10.") && cleaned.includes("/") ? cleaned : null;
}

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT, ...headers },
    signal: AbortSignal.timeout(LOOKUP_MS),
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Bron gaf HTTP ${res.status}.`);
  return (await res.json()) as T;
}

function nextPageCursor(total: number, start: number, received: number): string | null {
  const next = start + received;
  return received > 0 && next < total ? String(next) : null;
}

async function searchPubMed(query: string, cursor: string): Promise<SearchResult> {
  const start = Math.max(0, Number(cursor) || 0);
  const searchUrl =
    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?" +
    new URLSearchParams({
      db: "pubmed",
      retmode: "json",
      retmax: String(PAGE_SIZE),
      retstart: String(start),
      term: query,
      tool: "referentie",
      email: MAILTO,
    });
  const found = await fetchJson<{
    esearchresult?: { count?: string; idlist?: string[] };
  }>(searchUrl);
  const ids = found.esearchresult?.idlist ?? [];
  const total = Number(found.esearchresult?.count ?? "0") || 0;
  if (ids.length === 0) {
    return { source: "pubmed", total, nextCursor: null, items: [] };
  }

  const summaryUrl =
    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?" +
    new URLSearchParams({
      db: "pubmed",
      retmode: "json",
      id: ids.join(","),
      tool: "referentie",
      email: MAILTO,
    });
  const summary = await fetchJson<{
    result?: Record<string, PubMedArticle> & { uids?: string[] };
  }>(summaryUrl);
  const result = summary.result ?? {};
  const items = (result.uids ?? ids).flatMap((uid) => {
    const article = result[uid];
    if (!article || typeof article !== "object" || !article.title) return [];
    const doi = doiFrom(
      article.articleids?.find((entry) => entry.idtype === "doi")?.value ?? article.elocationid,
    );
    return [
      {
        id: `pubmed:${uid}`,
        title: decodeText(article.title),
        authors: formatNames((article.authors ?? []).map((author) => author.name ?? "")),
        year: yearFrom(article.pubdate),
        journal: decodeText(article.fulljournalname || article.source || "") || null,
        doi,
        pmid: uid,
        url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
      },
    ];
  });
  return {
    source: "pubmed",
    total,
    nextCursor: nextPageCursor(total, start, ids.length),
    items,
  };
}

type PubMedArticle = {
  title?: string;
  fulljournalname?: string;
  source?: string;
  pubdate?: string;
  elocationid?: string;
  authors?: { name?: string }[];
  articleids?: { idtype?: string; value?: string }[];
};

async function searchEuropePmc(query: string, cursor: string): Promise<SearchResult> {
  const url =
    "https://www.ebi.ac.uk/europepmc/webservices/rest/search?" +
    new URLSearchParams({
      query,
      format: "json",
      pageSize: String(PAGE_SIZE),
      resultType: "lite",
      cursorMark: cursor || "*",
    });
  const json = await fetchJson<{
    hitCount?: number;
    nextCursorMark?: string;
    resultList?: {
      result?: {
        id?: string;
        source?: string;
        title?: string;
        authorString?: string;
        journalTitle?: string;
        pubYear?: string;
        doi?: string;
        pmid?: string;
      }[];
    };
  }>(url);
  const rows = json.resultList?.result ?? [];
  const items: SearchHit[] = rows.flatMap((row) => {
    const title = decodeText(row.title ?? "");
    if (!title) return [];
    const pmid = row.pmid ?? null;
    const doi = doiFrom(row.doi);
    return [
      {
        id: `epmc:${row.source ?? "MED"}:${row.id ?? doi ?? title}`,
        title,
        authors: decodeText(row.authorString ?? ""),
        year: yearFrom(row.pubYear),
        journal: decodeText(row.journalTitle ?? "") || null,
        doi,
        pmid,
        url: pmid
          ? `https://europepmc.org/article/MED/${pmid}`
          : doi
            ? `https://doi.org/${doi}`
            : null,
      },
    ];
  });
  const next = json.nextCursorMark && json.nextCursorMark !== cursor ? json.nextCursorMark : null;
  return {
    source: "europepmc",
    total: json.hitCount ?? items.length,
    nextCursor: rows.length < PAGE_SIZE ? null : next,
    items,
  };
}

async function searchOpenAlex(query: string, cursor: string): Promise<SearchResult> {
  const page = Math.max(1, Number(cursor) || 1);
  const url =
    "https://api.openalex.org/works?" +
    new URLSearchParams({
      search: query,
      page: String(page),
      per_page: String(PAGE_SIZE),
      mailto: MAILTO,
      select: "id,display_name,publication_year,doi,authorships,primary_location,ids",
    });
  const json = await fetchJson<{
    meta?: { count?: number };
    results?: {
      id?: string;
      display_name?: string;
      publication_year?: number;
      doi?: string | null;
      authorships?: { author?: { display_name?: string } }[];
      primary_location?: { source?: { display_name?: string } | null } | null;
      ids?: { pmid?: string | null };
    }[];
  }>(url);
  const rows = json.results ?? [];
  const items: SearchHit[] = rows.flatMap((row) => {
    const title = decodeText(row.display_name ?? "");
    if (!title) return [];
    const doi = doiFrom(row.doi);
    const pmid = row.ids?.pmid?.split("/").pop() ?? null;
    return [
      {
        id: row.id ?? `openalex:${doi ?? title}`,
        title,
        authors: formatNames(
          (row.authorships ?? []).map((entry) => entry.author?.display_name ?? ""),
        ),
        year: yearFrom(row.publication_year),
        journal: decodeText(row.primary_location?.source?.display_name ?? "") || null,
        doi,
        pmid,
        url: doi ? `https://doi.org/${doi}` : (row.id ?? null),
      },
    ];
  });
  const total = json.meta?.count ?? items.length;
  const shown = page * PAGE_SIZE;
  return {
    source: "openalex",
    total,
    nextCursor: rows.length > 0 && shown < total && page < 20 ? String(page + 1) : null,
    items,
  };
}

async function searchCrossref(query: string, cursor: string): Promise<SearchResult> {
  const offset = Math.max(0, Number(cursor) || 0);
  const url =
    "https://api.crossref.org/works?" +
    new URLSearchParams({
      "query.bibliographic": query,
      rows: String(PAGE_SIZE),
      offset: String(offset),
    });
  const json = await fetchJson<{
    message?: {
      "total-results"?: number;
      items?: {
        DOI?: string;
        title?: string[];
        author?: { given?: string; family?: string }[];
        "container-title"?: string[];
        issued?: { "date-parts"?: number[][] };
        URL?: string;
      }[];
    };
  }>(url, { "User-Agent": USER_AGENT });
  const rows = json.message?.items ?? [];
  const items: SearchHit[] = rows.flatMap((row) => {
    const title = decodeText(row.title?.[0] ?? "");
    if (!title) return [];
    const doi = doiFrom(row.DOI);
    return [
      {
        id: `crossref:${doi ?? title}`,
        title,
        authors: formatNames(
          (row.author ?? []).map((author) => [author.given, author.family].filter(Boolean).join(" ")),
        ),
        year: yearFrom(row.issued?.["date-parts"]?.[0]?.[0]),
        journal: decodeText(row["container-title"]?.[0] ?? "") || null,
        doi,
        pmid: null,
        url: doi ? `https://doi.org/${doi}` : (row.URL ?? null),
      },
    ];
  });
  const total = json.message?.["total-results"] ?? items.length;
  return {
    source: "crossref",
    total,
    nextCursor: nextPageCursor(total, offset, rows.length),
    items,
  };
}

export async function searchLiterature(
  source: SearchSource,
  query: string,
  cursor = "",
): Promise<SearchResult> {
  const q = query.trim().slice(0, 300);
  if (q.length < 2) throw new Error("Typ minstens twee tekens.");
  if (source === "pubmed") return searchPubMed(q, cursor);
  if (source === "europepmc") return searchEuropePmc(q, cursor);
  if (source === "openalex") return searchOpenAlex(q, cursor);
  return searchCrossref(q, cursor);
}
