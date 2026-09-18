import { redisGet, redisSetEx } from "@/lib/redis";
import type { ReferenceInput } from "@/lib/references/types";

const CACHE_TTL = 60 * 60 * 24;

export function normalizeDoi(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:/i, "")
    .trim();
}

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

function stripAbstractHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function mapWork(work: CrossrefWork): ReferenceInput {
  const year = work.published?.["date-parts"]?.[0]?.[0] ?? null;
  return {
    type: "article",
    title: work.title?.[0]?.trim() ?? "Zonder titel",
    abstract: work.abstract ? stripAbstractHtml(work.abstract) : null,
    year,
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

export async function fetchMetadataByDoi(
  doiRaw: string,
): Promise<ReferenceInput> {
  const doi = normalizeDoi(doiRaw);
  if (!doi) {
    throw new Error("Ongeldige DOI.");
  }

  const cacheKey = `doi:${doi.toLowerCase()}`;
  const cached = await redisGet<ReferenceInput>(cacheKey);
  if (cached) return cached;

  const res = await fetch(
    `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "ReferentiePWA/1.0 (mailto:support@example.com)",
      },
      next: { revalidate: 0 },
    },
  );

  if (!res.ok) {
    if (res.status === 404) throw new Error("DOI niet gevonden bij Crossref.");
    throw new Error("Crossref niet bereikbaar.");
  }

  const json = (await res.json()) as { message?: CrossrefWork };
  const work = json.message;
  if (!work) throw new Error("Geen metadata ontvangen.");

  const mapped = mapWork(work);
  await redisSetEx(cacheKey, mapped, CACHE_TTL);
  return mapped;
}
