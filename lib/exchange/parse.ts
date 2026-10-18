import type { AuthorInput, ReferenceInput } from "@/lib/references/types";

/**
 * Inlezen van RIS (EndNote, Zotero, uitgevers), BibTeX en PubMed/MEDLINE (.nbib).
 * Geeft ReferenceInput-objecten terug; controle en opslaan gebeurt in de import-route.
 */

export type ImportFormat = "ris" | "bibtex" | "medline";

export function detectFormat(content: string): ImportFormat | null {
  const text = content.replace(/^﻿/, "");
  if (/^\s*@\w+\s*[{(]/m.test(text)) return "bibtex";
  if (/^PMID-\s*\d+/m.test(text)) return "medline";
  if (/^TY {2}- /m.test(text)) return "ris";
  return null;
}

export function parseReferences(content: string, format?: ImportFormat): ReferenceInput[] {
  const text = content.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const kind = format ?? detectFormat(text);
  if (kind === "bibtex") return parseBibtex(text);
  if (kind === "medline") return parseMedline(text);
  if (kind === "ris") return parseRis(text);
  return [];
}

// ---------- gedeelde helpers ----------

function firstYear(value: string | undefined): number | null {
  const match = value?.match(/\b(1[5-9]\d\d|20\d\d|21\d\d)\b/);
  return match ? Number(match[1]) : null;
}

/** "Jansen, Jan P." of "Jan P. Jansen" → voor- en achternaam. */
function splitName(raw: string): AuthorInput {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.includes(",")) {
    const [family, ...rest] = name.split(",");
    return { familyName: family.trim(), givenName: rest.join(",").trim() };
  }
  const parts = name.split(" ");
  const familyName = parts.pop() ?? "";
  return { familyName, givenName: parts.join(" ") };
}

function cleanDoi(value: string | undefined): string | null {
  if (!value) return null;
  const match = value.match(/10\.\d{4,9}\/\S+/);
  return match ? match[0].replace(/[.,;]+$/, "") : null;
}

function pages(start?: string, end?: string): string | null {
  const s = start?.trim();
  const e = end?.trim();
  if (s && e && e !== s) return `${s}-${e}`;
  return s || null;
}

function compact(input: ReferenceInput): ReferenceInput | null {
  if (!input.title?.trim()) return null;
  return input;
}

// ---------- RIS ----------

const RIS_TYPE: Record<string, string> = {
  JOUR: "article",
  JFULL: "article",
  MGZN: "article",
  NEWS: "article",
  EJOUR: "article",
  BOOK: "book",
  EBOOK: "book",
  CHAP: "chapter",
  ECHAP: "chapter",
  CONF: "conference",
  CPAPER: "conference",
  THES: "thesis",
  RPRT: "report",
  ELEC: "web",
  WEB: "web",
};

export function parseRis(text: string): ReferenceInput[] {
  const out: ReferenceInput[] = [];
  let fields: Record<string, string[]> = {};
  let last: string | null = null;

  const flush = () => {
    if (Object.keys(fields).length === 0) return;
    const get = (...tags: string[]) => tags.map((t) => fields[t]?.[0]).find((v) => v?.trim())?.trim();
    const all = (...tags: string[]) => tags.flatMap((t) => fields[t] ?? []).map((v) => v.trim()).filter(Boolean);
    const ref = compact({
      type: RIS_TYPE[get("TY") ?? ""] ?? "article",
      title: get("TI", "T1", "CT", "BT") ?? "",
      authors: all("AU", "A1").map(splitName),
      year: firstYear(get("PY", "Y1", "DA")),
      journal: get("T2", "JF", "JO", "JA", "J2") ?? null,
      volume: get("VL") ?? null,
      issue: get("IS") ?? null,
      pages: pages(get("SP"), get("EP")),
      doi: cleanDoi(get("DO", "M3")) ?? null,
      url: get("UR", "L2") ?? null,
      abstract: get("AB", "N2") ?? null,
      tags: all("KW"),
    });
    if (ref) out.push(ref);
    fields = {};
    last = null;
  };

  for (const line of text.split("\n")) {
    const match = line.match(/^([A-Z][A-Z0-9]) {2}-(?: (.*))?$/);
    if (match) {
      const [, tag, value = ""] = match;
      if (tag === "ER") {
        flush();
        continue;
      }
      (fields[tag] ??= []).push(value);
      last = tag;
    } else if (last && line.trim()) {
      // Vervolgregel (lange abstracts in sommige exports).
      const list = fields[last];
      list[list.length - 1] += ` ${line.trim()}`;
    }
  }
  flush();
  return out;
}

// ---------- PubMed / MEDLINE (.nbib) ----------

export function parseMedline(text: string): ReferenceInput[] {
  const out: ReferenceInput[] = [];
  for (const block of text.split(/\n\s*\n(?=PMID-)/)) {
    const fields: Record<string, string[]> = {};
    let last: string | null = null;
    for (const line of block.split("\n")) {
      const match = line.match(/^([A-Z]{2,4})\s*- (.*)$/);
      if (match) {
        const [, tag, value] = match;
        (fields[tag] ??= []).push(value.trim());
        last = tag;
      } else if (last && /^\s{6}/.test(line)) {
        const list = fields[last];
        list[list.length - 1] += ` ${line.trim()}`;
      }
    }
    const get = (tag: string) => fields[tag]?.[0];
    const doi =
      (fields.LID ?? []).concat(fields.AID ?? []).find((v) => v.includes("[doi]")) ?? undefined;
    const fullAuthors = fields.FAU ?? [];
    const authors = (fullAuthors.length > 0 ? fullAuthors : (fields.AU ?? [])).map((name) => {
      if (name.includes(",")) return splitName(name);
      // "Jansen JP": achternaam, dan initialen.
      const parts = name.split(" ");
      const initials = parts.length > 1 ? parts.pop()! : "";
      return { familyName: parts.join(" "), givenName: initials };
    });
    const ref = compact({
      type: "article",
      title: (get("TI") ?? "").replace(/\.$/, ""),
      authors,
      year: firstYear(get("DP")),
      journal: get("JT") ?? get("TA") ?? null,
      volume: get("VI") ?? null,
      issue: get("IP") ?? null,
      pages: get("PG") ?? null,
      doi: cleanDoi(doi),
      pmid: get("PMID") ?? null,
      abstract: get("AB") ?? null,
      tags: fields.OT ?? [],
    });
    if (ref) out.push(ref);
  }
  return out;
}

// ---------- BibTeX ----------

const BIBTEX_TYPE: Record<string, string> = {
  article: "article",
  book: "book",
  inbook: "chapter",
  incollection: "chapter",
  inproceedings: "conference",
  conference: "conference",
  phdthesis: "thesis",
  mastersthesis: "thesis",
  techreport: "report",
  online: "web",
  misc: "other",
};

/** Eenvoudige LaTeX-tekens naar Unicode ({\"o} → ö, \& → &). */
function delatex(value: string): string {
  const accents: Record<string, Record<string, string>> = {
    '"': { a: "ä", o: "ö", u: "ü", e: "ë", i: "ï", A: "Ä", O: "Ö", U: "Ü" },
    "'": { a: "á", e: "é", i: "í", o: "ó", u: "ú", E: "É" },
    "`": { a: "à", e: "è", i: "ì", o: "ò", u: "ù" },
    "^": { a: "â", e: "ê", i: "î", o: "ô", u: "û" },
    "~": { n: "ñ", a: "ã", o: "õ", N: "Ñ" },
    c: { c: "ç", C: "Ç" },
  };
  return value
    .replace(/\{?\\(["'`^~c])\s*\{?([a-zA-Z])\}?\}?/g, (m, accent: string, letter: string) => accents[accent]?.[letter] ?? letter)
    .replace(/\\ss\b/g, "ß")
    .replace(/\\o\b/g, "ø")
    .replace(/\\aa\b/g, "å")
    .replace(/\\([&%$#_])/g, "$1")
    .replace(/--/g, "–")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Leest één veldwaarde vanaf `pos`: {…} met nesting, "…", of een kaal woord/getal. */
function readValue(src: string, pos: number): [string, number] {
  let i = pos;
  while (/\s/.test(src[i] ?? "")) i++;
  let value = "";
  const readPart = () => {
    if (src[i] === "{") {
      let depth = 0;
      const start = i;
      for (; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}" && --depth === 0) break;
      }
      value += src.slice(start + 1, i);
      i++;
    } else if (src[i] === '"') {
      const start = ++i;
      let depth = 0;
      for (; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") depth--;
        else if (src[i] === '"' && depth === 0) break;
      }
      value += src.slice(start, i);
      i++;
    } else {
      const match = src.slice(i).match(/^[^,}\s#]+/);
      value += match ? match[0] : "";
      i += match ? match[0].length : 0;
    }
  };
  readPart();
  // Aaneenschakeling met #.
  for (;;) {
    let j = i;
    while (/\s/.test(src[j] ?? "")) j++;
    if (src[j] !== "#") break;
    i = j + 1;
    while (/\s/.test(src[i] ?? "")) i++;
    readPart();
  }
  return [value, i];
}

export function parseBibtex(text: string): ReferenceInput[] {
  const out: ReferenceInput[] = [];
  const entryRe = /@(\w+)\s*[{(]/g;
  let match: RegExpExecArray | null;
  while ((match = entryRe.exec(text))) {
    const type = match[1].toLowerCase();
    if (type === "comment" || type === "preamble" || type === "string") continue;
    let i = entryRe.lastIndex;
    // Sleutel overslaan tot de eerste komma.
    const comma = text.indexOf(",", i);
    if (comma < 0) break;
    i = comma + 1;
    const fields: Record<string, string> = {};
    for (;;) {
      const nameMatch = text.slice(i).match(/^\s*([A-Za-z][\w-]*)\s*=/);
      if (!nameMatch) break;
      i += nameMatch[0].length;
      const [value, next] = readValue(text, i);
      fields[nameMatch[1].toLowerCase()] = value;
      i = next;
      const sep = text.slice(i).match(/^\s*,/);
      if (!sep) break;
      i += sep[0].length;
    }
    entryRe.lastIndex = i;

    const f = (name: string) => (fields[name] ? delatex(fields[name]) : undefined);
    const ref = compact({
      type: BIBTEX_TYPE[type] ?? "article",
      title: f("title") ?? "",
      authors: (fields.author ?? "")
        .split(/\s+and\s+/i)
        .map((name) => delatex(name))
        .filter(Boolean)
        .map(splitName),
      year: firstYear(f("year") ?? f("date")),
      journal: f("journal") ?? f("journaltitle") ?? f("booktitle") ?? null,
      volume: f("volume") ?? null,
      issue: f("number") ?? f("issue") ?? null,
      pages: f("pages")?.replace(/[–—]/g, "-") ?? null,
      doi: cleanDoi(f("doi")),
      url: f("url") ?? null,
      pmid: f("pmid") ?? null,
      abstract: f("abstract") ?? null,
      tags: (f("keywords") ?? "")
        .split(/[,;]/)
        .map((k) => k.trim())
        .filter(Boolean),
    });
    if (ref) out.push(ref);
  }
  return out;
}
