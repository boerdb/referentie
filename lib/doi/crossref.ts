import { redisGet, redisSetEx } from "@/lib/redis";
import type { ReferenceInput } from "@/lib/references/types";
import {
  cleanDoiForLookup,
  doiLookupCandidates,
  normalizeDoi,
} from "@/lib/doi/normalize";

export { cleanDoiForLookup, doiLookupCandidates, normalizeDoi };

const CACHE_TTL = 60 * 60 * 24;
const LOOKUP_MS = 12_000;

type CrossrefWork = {
  title?: string[];
  author?: { given?: string; family?: string }[];
  published?: { "date-parts"?: number[][] };
  "container-title"?: string[];
  volume?: string;
  issue?: string;
  page?: string;
  DOI?: string;
  URL?: string;
  abstract?: string;
};

type CslWork = {
  title?: string | string[];
  abstract?: string;
  DOI?: string;
  URL?: string;
  "container-title"?: string | string[];
  volume?: string | number;
  issue?: string | number;
  page?: string;
  issued?: { "date-parts"?: number[][] };
  author?: { given?: string; family?: string }[];
};

function stripAbstractHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function yearFromParts(parts?: number[][]): number | null {
  return parts?.[0]?.[0] ?? null;
}

function firstString(value: string | string[] | undefined): string | null {
  if (!value) return null;
  const s = Array.isArray(value) ? value[0] : value;
  const t = s?.trim();
  return t || null;
}

function mapWork(work: CrossrefWork): ReferenceInput {
  return {
    type: "article",
    title: work.title?.[0]?.trim() ?? "Zonder titel",
    abstract: work.abstract ? stripAbstractHtml(work.abstract) : null,
    year: yearFromParts(work.published?.["date-parts"]),
    journal: work["container-title"]?.[0]?.trim() ?? null,
    volume: work.volume ?? null,
    issue: work.issue ?? null,
    pages: work.page ?? null,
    doi: work.DOI ? normalizeDoi(work.DOI) : null,
    url: work.URL ?? null,
    authors:
      work.author?.map((a) => ({
        givenName: a.given ?? "",
        familyName: a.family ?? "",
      })) ?? [],
  };
}

function mapCsl(work: CslWork): ReferenceInput {
  return {
    type: "article",
    title: firstString(work.title) ?? "Zonder titel",
    abstract: work.abstract ? stripAbstractHtml(work.abstract) : null,
    year: yearFromParts(work.issued?.["date-parts"]),
    journal: firstString(work["container-title"]),
    volume: work.volume != null ? String(work.volume) : null,
    issue: work.issue != null ? String(work.issue) : null,
    pages: work.page ?? null,
    doi: work.DOI ? normalizeDoi(work.DOI) : null,
    url: work.URL ?? null,
    authors:
      work.author?.map((a) => ({
        givenName: a.given ?? "",
        familyName: a.family ?? "",
      })) ?? [],
  };
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<Response> {
  return fetch(url, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(LOOKUP_MS),
  });
}

async function fetchFromCrossref(doi: string): Promise<ReferenceInput> {
  const res = await fetchJson(
    `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
    {
      Accept: "application/json",
      "User-Agent": "ReferentiePWA/1.0 (mailto:support@clvs.nl)",
    },
  );
  if (!res.ok) {
    if (res.status === 404) throw new Error("DOI niet gevonden bij Crossref.");
    throw new Error(`Crossref gaf HTTP ${res.status}.`);
  }
  const json = (await res.json()) as { message?: CrossrefWork };
  const work = json.message;
  if (!work) throw new Error("Geen metadata ontvangen.");
  return mapWork(work);
}

async function fetchFromDoiOrg(doi: string): Promise<ReferenceInput> {
  const res = await fetchJson(`https://doi.org/${doi}`, {
    Accept: "application/vnd.citationstyles.csl+json",
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error("DOI niet gevonden.");
    throw new Error(`doi.org gaf HTTP ${res.status}.`);
  }
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("json")) {
    throw new Error("doi.org gaf geen JSON-metadata.");
  }
  const work = (await res.json()) as CslWork;
  if (!firstString(work.title) && !work.DOI) {
    throw new Error("Geen metadata ontvangen.");
  }
  return mapCsl(work);
}

async function fetchMetadataByDoiOnce(doi: string): Promise<ReferenceInput> {
  const cacheKey = `doi:${doi.toLowerCase()}`;
  const cached = await redisGet<ReferenceInput>(cacheKey);
  if (cached) return cached;

  let lastErr: Error | null = null;
  for (const fn of [fetchFromCrossref, fetchFromDoiOrg]) {
    try {
      const mapped = await fn(doi);
      await redisSetEx(cacheKey, mapped, CACHE_TTL);
      return mapped;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error("DOI ophalen mislukt.");
    }
  }
  throw lastErr ?? new Error("DOI ophalen mislukt.");
}

export async function fetchMetadataByDoi(
  doiRaw: string,
): Promise<ReferenceInput> {
  const candidates = doiLookupCandidates(doiRaw);
  if (candidates.length === 0) {
    throw new Error("Ongeldige DOI.");
  }

  let lastErr: Error | null = null;
  for (const doi of candidates) {
    try {
      return await fetchMetadataByDoiOnce(doi);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error("DOI ophalen mislukt.");
    }
  }
  throw lastErr ?? new Error("DOI niet gevonden.");
}
