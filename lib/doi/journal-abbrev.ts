import { redisGet, redisSetEx } from "@/lib/redis";

/**
 * Afkorting van een tijdschrift (NLM/MEDLINE, bijv. "N Engl J Med") via de NLM Catalog.
 * Alleen een exacte titelovereenkomst telt; bij twijfel geen afkorting.
 */
const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const LOOKUP_MS = 10_000;
const CACHE_TTL = 60 * 60 * 24 * 30;
/** Ook "niet gevonden" onthouden, maar korter. */
const MISS_TTL = 60 * 60 * 24 * 7;
const MISS = "-";

/** "The Lancet. Respiratory medicine (London)" → "lancet respiratory medicine". */
export function normalizeJournalTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Ondertitel weg: "Critical care : the official journal of …" → "critical care".
    .replace(/\s*:\s.*$/, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "");
}

/**
 * Lijkt `abbrev` echt een afkorting van `title`? Elk woord moet het begin zijn van een
 * volgend woord in de titel ("N Engl J Med" ← "New England Journal of Medicine").
 * Crossref geeft soms een bijnaam van de uitgever ("ICMx", "JCM"); die vallen hierdoor af.
 */
export function isPlausibleAbbrev(abbrev: string, title: string): boolean {
  const clean = (s: string) =>
    s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ");
  const tokens = clean(abbrev).split(/[^a-z0-9]+/).filter(Boolean);
  const words = clean(title).split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.length === 0) return false;
  let at = 0;
  for (const token of tokens) {
    while (at < words.length && !words[at].startsWith(token)) at += 1;
    if (at >= words.length) return false;
    at += 1;
  }
  return true;
}

type CatalogEntry = {
  titlemainlist?: { title?: string }[];
  medlineta?: string;
  currentindexingstatus?: string;
  endyear?: string;
};

async function getJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`NLM gaf HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Woorden die de NLM Catalog niet indexeert; meezoeken geeft dan nul treffers. */
const STOPWORDS = new Set(["and", "of", "the", "for", "in", "on", "a", "an", "to", "de", "des", "du", "la", "le", "et", "und", "fur", "der", "die", "das"]);

/** Zoekterm per woord ("&" en leestekens breken een zinszoekopdracht in de NLM Catalog). */
export function nlmTitleTerm(wanted: string): string {
  const words = wanted.split(" ").filter((w) => w && !STOPWORDS.has(w));
  return `${words.map((w) => `${w}[Title]`).join(" AND ")} AND ncbijournals[filter]`;
}

async function postJson<T>(url: string, body: URLSearchParams): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_MS);
  try {
    const res = await fetch(url, { method: "POST", body, signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`NLM gaf HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function lookupAtNlm(journal: string): Promise<string | null> {
  const wanted = normalizeJournalTitle(journal);
  if (!wanted) return null;
  // Eerst alleen tijdschriften die MEDLINE nu indexeert (kleine set), dan alle.
  for (const [i, extra] of [" AND currentlyindexed[All]", ""].entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 400));
    const abbrev = await searchNlm(nlmTitleTerm(wanted) + extra, wanted);
    if (abbrev) return abbrev;
  }
  return null;
}

async function searchNlm(term: string, wanted: string): Promise<string | null> {
  const search = await getJson<{ esearchresult?: { idlist?: string[] } }>(
    `${EUTILS}/esearch.fcgi?db=nlmcatalog&retmode=json&retmax=200&tool=referentie&term=${encodeURIComponent(term)}`,
  );
  const ids = search.esearchresult?.idlist ?? [];
  if (ids.length === 0) return null;
  await new Promise((r) => setTimeout(r, 400));
  const summary = await postJson<{ result?: Record<string, CatalogEntry> & { uids?: string[] } }>(
    `${EUTILS}/esummary.fcgi`,
    new URLSearchParams({ db: "nlmcatalog", retmode: "json", tool: "referentie", id: ids.join(",") }),
  );
  const result = summary.result ?? {};
  const matches = (result.uids ?? ids)
    .map((uid) => result[uid] as CatalogEntry | undefined)
    .filter((entry): entry is CatalogEntry => {
      if (!entry?.medlineta) return false;
      // Alleen de hoofdtitel: alternatieve titels zijn vaak voorgangers (andere afkorting).
      return (entry.titlemainlist ?? []).some((t) => normalizeJournalTitle(t.title ?? "") === wanted);
    });
  return pickCatalogEntry(matches)?.medlineta?.trim() || null;
}

/** Eén treffer, of bij meerdere: het tijdschrift dat MEDLINE nu indexeert, dan het nog lopende. */
function pickCatalogEntry(matches: CatalogEntry[]): CatalogEntry | null {
  for (const subset of [
    matches,
    matches.filter((m) => m.currentindexingstatus === "Y"),
    matches.filter((m) => m.endyear === "9999"),
  ]) {
    if (subset.length === 1) return subset[0];
  }
  return null;
}

/** NCBI staat zonder API-sleutel 3 verzoeken per seconde toe: opzoekingen één voor één. */
let queue: Promise<unknown> = Promise.resolve();
const inFlight = new Map<string, Promise<string | null>>();

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => new Promise((r) => setTimeout(r, 800)),
    () => new Promise((r) => setTimeout(r, 800)),
  );
  return run;
}

/** Afkorting voor een tijdschriftnaam, of null. Gooit niet; fouten worden niet onthouden. */
export function lookupJournalAbbrev(journal: string): Promise<string | null> {
  const key = `jabbr:${normalizeJournalTitle(journal)}`;
  let pending = inFlight.get(key);
  if (!pending) {
    pending = lookupCached(key, journal).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  return pending;
}

async function lookupCached(key: string, journal: string): Promise<string | null> {
  try {
    const cached = await redisGet<string>(key);
    if (cached) return cached === MISS ? null : cached;
  } catch {
    // Geen cache: gewoon opzoeken.
  }
  try {
    const abbrev = await throttled(() => lookupAtNlm(journal));
    try {
      await redisSetEx(key, abbrev ?? MISS, abbrev ? CACHE_TTL : MISS_TTL);
    } catch {
      // Cache is optioneel.
    }
    return abbrev;
  } catch (e) {
    console.warn("[journal-abbrev]", e instanceof Error ? e.message : e);
    return null;
  }
}
