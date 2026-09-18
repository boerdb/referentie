import { redisGet, redisSetEx } from "@/lib/redis";
import type { ReferenceInput } from "@/lib/references/types";
import { fetchAbstractByDoi, stripAbstractHtml } from "@/lib/doi/abstract";
import {
  cleanDoiForLookup,
  doiLookupCandidates,
  normalizeDoi,
} from "@/lib/doi/normalize";

export { cleanDoiForLookup, doiLookupCandidates, normalizeDoi };

const CACHE_TTL = 60 * 60 * 24;
const LOOKUP_MS = 15_000;

type DateParts = { "date-parts"?: number[][] };

type CrossrefWork = {
  title?: string[];
  author?: { given?: string; family?: string }[];
  published?: DateParts;
  "published-print"?: DateParts;
  "published-online"?: DateParts;
  issued?: DateParts;
  created?: DateParts;
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
  issued?: DateParts;
  published?: DateParts;
  author?: { given?: string; family?: string }[];
};

function yearFromParts(parts?: number[][]): number | null {
  const y = parts?.[0]?.[0];
  return typeof y === "number" && y > 1000 ? y : null;
}

function yearFromWork(work: {
  published?: DateParts;
  "published-print"?: DateParts;
  "published-online"?: DateParts;
  issued?: DateParts;
  created?: DateParts;
}): number | null {
  return (
    yearFromParts(work.issued?.["date-parts"]) ??
    yearFromParts(work.published?.["date-parts"]) ??
    yearFromParts(work["published-print"]?.["date-parts"]) ??
    yearFromParts(work["published-online"]?.["date-parts"]) ??
    yearFromParts(work.created?.["date-parts"])
  );
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
    year: yearFromWork(work),
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
    year: yearFromWork(work),
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

async function fetchJson(
  url: string,
  headers: Record<string, string>,
): Promise<Response> {
  const request = fetch(url, {
    headers,
    redirect: "follow",
    next: { revalidate: 0 },
  });
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Timeout bij metadata ophalen.")), LOOKUP_MS);
  });
  return Promise.race([request, timeout]);
}

function crossrefUrls(doi: string): string[] {
  const encoded = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  const raw = `https://api.crossref.org/works/${doi}`;
  return encoded === raw ? [encoded] : [encoded, raw];
}

async function fetchFromCrossref(doi: string): Promise<ReferenceInput> {
  const headers = {
    Accept: "application/json",
    "User-Agent": "ReferentiePWA/1.0 (mailto:support@clvs.nl)",
  };
  let lastStatus = 0;
  for (const url of crossrefUrls(doi)) {
    const res = await fetchJson(url, headers);
    lastStatus = res.status;
    if (res.status === 404) continue;
    if (!res.ok) continue;
    const json = (await res.json()) as { message?: CrossrefWork };
    const work = json.message;
    if (!work) continue;
    return mapWork(work);
  }
  if (lastStatus === 404) throw new Error("DOI niet gevonden bij Crossref.");
  throw new Error(`Crossref gaf HTTP ${lastStatus || "geen antwoord"}.`);
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

async function cachedGet(doi: string): Promise<ReferenceInput | null> {
  try {
    return await redisGet<ReferenceInput>(`doi:${doi.toLowerCase()}`);
  } catch (e) {
    console.warn("[doi-cache get]", e instanceof Error ? e.message : e);
    return null;
  }
}

async function cachedSet(doi: string, value: ReferenceInput): Promise<void> {
  try {
    await redisSetEx(`doi:${doi.toLowerCase()}`, value, CACHE_TTL);
  } catch (e) {
    console.warn("[doi-cache set]", e instanceof Error ? e.message : e);
  }
}

async function withAbstract(
  doi: string,
  metadata: ReferenceInput,
): Promise<ReferenceInput> {
  if (metadata.abstract) return metadata;
  const abstract = await fetchAbstractByDoi(metadata.doi ?? doi);
  return abstract ? { ...metadata, abstract } : metadata;
}

async function fetchMetadataByDoiOnce(doi: string): Promise<ReferenceInput> {
  const cached = await cachedGet(doi);
  if (cached?.title) {
    if (cached.abstract) return cached;
    const enriched = await withAbstract(doi, cached);
    if (enriched.abstract) await cachedSet(doi, enriched);
    return enriched;
  }

  const errors: string[] = [];
  for (const fn of [fetchFromCrossref, fetchFromDoiOrg]) {
    try {
      const mapped = await withAbstract(doi, await fn(doi));
      await cachedSet(doi, mapped);
      return mapped;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "onbekend");
    }
  }
  throw new Error(errors[errors.length - 1] ?? "DOI ophalen mislukt.");
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
