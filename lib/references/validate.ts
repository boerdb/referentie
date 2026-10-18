import type { AuthorInput, ReferenceInput, RefStatus } from "./types";

const STATUSES: RefStatus[] = ["unread", "reading", "read"];
const TYPES = ["article", "book", "chapter", "conference", "thesis", "report", "web", "other"];

/** Maximale lengtes volgens sql/schema.sql. */
const TEXT_FIELDS = {
  journal: 512,
  volume: 64,
  issue: 64,
  pages: 64,
  doi: 255,
  url: 2048,
  pmid: 32,
  citeKey: 128,
} as const;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function optionalText(
  value: unknown,
  label: string,
  max: number,
): Result<string | null | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: `${label} moet tekst zijn.` };
  if (value.trim().length > max) {
    return { ok: false, error: `${label} is langer dan ${max} tekens.` };
  }
  return { ok: true, value };
}

function parseAuthors(value: unknown): Result<AuthorInput[] | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(value) || value.length > 500) {
    return { ok: false, error: "Auteurs moeten een lijst zijn." };
  }
  const authors: AuthorInput[] = [];
  for (const a of value) {
    if (typeof a !== "object" || a === null) {
      return { ok: false, error: "Ongeldige auteur." };
    }
    const { givenName, familyName } = a as Record<string, unknown>;
    if (
      (givenName !== undefined && typeof givenName !== "string") ||
      (familyName !== undefined && typeof familyName !== "string")
    ) {
      return { ok: false, error: "Auteursnamen moeten tekst zijn." };
    }
    authors.push({
      givenName: (givenName as string | undefined)?.slice(0, 255),
      familyName: (familyName as string | undefined)?.slice(0, 255),
    });
  }
  return { ok: true, value: authors };
}

/**
 * Controleert een (gedeeltelijke) referentie uit een request-body.
 * Met `partial: false` is een titel verplicht.
 */
export function parseReferenceInput(
  body: unknown,
  { partial }: { partial: boolean },
): Result<Partial<ReferenceInput>> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Ongeldige invoer." };
  }
  const b = body as Record<string, unknown>;
  const out: Partial<ReferenceInput> = {};

  if (b.title !== undefined || !partial) {
    if (typeof b.title !== "string" || !b.title.trim()) {
      return { ok: false, error: "Titel is verplicht." };
    }
    if (b.title.trim().length > 1024) {
      return { ok: false, error: "Titel is langer dan 1024 tekens." };
    }
    out.title = b.title;
  }

  if (b.type !== undefined) {
    if (typeof b.type !== "string" || !TYPES.includes(b.type)) {
      return { ok: false, error: "Onbekend referentietype." };
    }
    out.type = b.type;
  }

  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status as RefStatus)) {
      return { ok: false, error: "Onbekende leesstatus." };
    }
    out.status = b.status as RefStatus;
  }

  if (b.starred !== undefined) {
    if (typeof b.starred !== "boolean") {
      return { ok: false, error: "Favoriet moet waar of onwaar zijn." };
    }
    out.starred = b.starred;
  }

  if (b.year !== undefined) {
    if (
      b.year !== null &&
      (typeof b.year !== "number" || !Number.isInteger(b.year) || b.year < 1000 || b.year > 2200)
    ) {
      return { ok: false, error: "Ongeldig jaartal." };
    }
    out.year = b.year as number | null;
  }

  if (b.abstract !== undefined) {
    if (b.abstract !== null && typeof b.abstract !== "string") {
      return { ok: false, error: "Abstract moet tekst zijn." };
    }
    out.abstract = b.abstract as string | null;
  }

  for (const [key, max] of Object.entries(TEXT_FIELDS) as [keyof typeof TEXT_FIELDS, number][]) {
    const parsed = optionalText(b[key], key, max);
    if (!parsed.ok) return parsed;
    if (parsed.value !== undefined) out[key] = parsed.value;
  }

  if (b.label !== undefined) {
    if (b.label !== null && (!Number.isInteger(b.label) || (b.label as number) < 1 || (b.label as number) > 7)) {
      return { ok: false, error: "Ongeldig label." };
    }
    out.label = b.label as number | null;
  }

  if (b.tags !== undefined) {
    const tags = parseTagNames(b.tags);
    if (!tags.ok) return tags;
    out.tags = tags.value;
  }

  const authors = parseAuthors(b.authors);
  if (!authors.ok) return authors;
  if (authors.value !== undefined) out.authors = authors.value;

  return { ok: true, value: out };
}

/** Trefwoorden: maximaal 50 per artikel, elk 1–100 tekens, dubbele (hoofdletterongevoelig) eruit. */
export function parseTagNames(value: unknown): Result<string[]> {
  if (!Array.isArray(value) || value.length > 50) {
    return { ok: false, error: "Trefwoorden moeten een lijst van maximaal 50 zijn." };
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") return { ok: false, error: "Trefwoorden moeten tekst zijn." };
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name) continue;
    if (name.length > 100) return { ok: false, error: "Een trefwoord is langer dan 100 tekens." };
    const key = name.toLocaleLowerCase("nl");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return { ok: true, value: out };
}
