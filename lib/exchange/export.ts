import type { ReferenceRecord } from "@/lib/references/types";

/** Export als RIS (EndNote, Zotero, Mendeley) of BibTeX (LaTeX). */

const RIS_TYPE: Record<string, string> = {
  article: "JOUR",
  book: "BOOK",
  chapter: "CHAP",
  conference: "CPAPER",
  thesis: "THES",
  report: "RPRT",
  web: "ELEC",
};

export function toRis(refs: ReferenceRecord[]): string {
  const lines: string[] = [];
  const add = (tag: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === "") return;
    lines.push(`${tag}  - ${String(value).replace(/\s*\n\s*/g, " ")}`);
  };
  for (const ref of refs) {
    add("TY", RIS_TYPE[ref.type] ?? "GEN");
    add("TI", ref.title);
    for (const a of ref.authors) {
      add("AU", [a.familyName, a.givenName].filter(Boolean).join(", "));
    }
    add("PY", ref.year);
    add("T2", ref.journal);
    add("VL", ref.volume);
    add("IS", ref.issue);
    if (ref.pages) {
      const [start, end] = ref.pages.split(/[-–]/);
      add("SP", start);
      add("EP", end);
    }
    add("DO", ref.doi);
    add("UR", ref.url ?? (ref.doi ? `https://doi.org/${ref.doi}` : null));
    add("AN", ref.pmid);
    add("AB", ref.abstract);
    for (const tag of ref.tags) add("KW", tag);
    lines.push("ER  - ", "");
  }
  return lines.join("\n");
}

function escapeBibtex(value: string): string {
  return value.replace(/[{}\\]/g, "\\$&").replace(/([&%$#_])/g, "\\$1");
}

const BIBTEX_TYPE: Record<string, string> = {
  article: "article",
  book: "book",
  chapter: "incollection",
  conference: "inproceedings",
  thesis: "phdthesis",
  report: "techreport",
  web: "online",
};

/** Sleutel als "Meyhoff2022"; bij dubbelen a, b, c erachter. */
function keys(refs: ReferenceRecord[]): string[] {
  const used = new Map<string, number>();
  return refs.map((ref) => {
    const base =
      ref.citeKey?.trim().replace(/\s+/g, "") ||
      `${(ref.authors[0]?.familyName ?? "ref").normalize("NFKD").replace(/[^\w]/g, "") || "ref"}${ref.year ?? "nd"}`;
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    return n === 0 ? base : `${base}${String.fromCharCode(96 + n)}`;
  });
}

export function toBibtex(refs: ReferenceRecord[]): string {
  const ids = keys(refs);
  return refs
    .map((ref, index) => {
      const fields: [string, string | number | null | undefined][] = [
        ["title", ref.title],
        [
          "author",
          ref.authors
            .map((a) => [a.familyName, a.givenName].filter(Boolean).join(", "))
            .filter(Boolean)
            .join(" and "),
        ],
        [ref.type === "chapter" || ref.type === "conference" ? "booktitle" : "journal", ref.journal],
        ["year", ref.year],
        ["volume", ref.volume],
        ["number", ref.issue],
        ["pages", ref.pages?.replace(/[-–]/, "--")],
        ["doi", ref.doi],
        ["url", ref.url],
        ["pmid", ref.pmid],
        ["keywords", ref.tags.join(", ")],
        ["abstract", ref.abstract],
      ];
      const body = fields
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        // DOI en URL letterlijk laten; LaTeX-pakketten (url, doi) verwachten geen escapes.
        .map(([k, v]) => `  ${k} = {${typeof v === "number" || k === "url" || k === "doi" ? v : escapeBibtex(String(v))}}`)
        .join(",\n");
      return `@${BIBTEX_TYPE[ref.type] ?? "misc"}{${ids[index]},\n${body}\n}`;
    })
    .join("\n\n");
}
