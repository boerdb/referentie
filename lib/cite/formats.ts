import type { ReferenceRecord } from "@/lib/references/types";

export type CiteStyle = "apa" | "mla" | "chicago";

function formatAuthorsApa(
  authors: ReferenceRecord["authors"],
  max = 20,
): string {
  if (!authors.length) return "";
  const parts = authors.slice(0, max).map((a) => {
    const initial = a.givenName
      ? `${a.givenName.trim().charAt(0).toUpperCase()}.`
      : "";
    return `${a.familyName}${initial ? `, ${initial}` : ""}`.trim();
  });
  if (authors.length > max) parts.push("…");
  return parts.join(", ");
}

function formatAuthorsMla(authors: ReferenceRecord["authors"]): string {
  if (!authors.length) return "";
  if (authors.length === 1) {
    const a = authors[0];
    return `${a.familyName}, ${a.givenName}`.trim();
  }
  const first = authors[0];
  const rest = authors
    .slice(1)
    .map((a) => `${a.givenName} ${a.familyName}`.trim())
    .join(", ");
  return `${first.familyName}, ${first.givenName}, et al. ${rest}`.replace(
    /, et al\. .*/,
    ", et al.",
  );
}

function formatAuthorsChicago(authors: ReferenceRecord["authors"]): string {
  if (!authors.length) return "";
  if (authors.length === 1) {
    const a = authors[0];
    return `${a.familyName}, ${a.givenName}`.trim();
  }
  if (authors.length === 2) {
    const [a, b] = authors;
    return `${a.familyName}, ${a.givenName}, and ${b.givenName} ${b.familyName}`;
  }
  const first = authors[0];
  return `${first.familyName}, ${first.givenName}, et al.`;
}

export function formatCitation(
  ref: ReferenceRecord,
  style: CiteStyle,
): string {
  const year = ref.year ?? "n.d.";
  const title = ref.title;
  const journal = ref.journal ?? "";
  const vol = ref.volume ?? "";
  const issue = ref.issue ? `(${ref.issue})` : "";
  const pages = ref.pages ? `, ${ref.pages}` : "";
  const doi = ref.doi ? ` https://doi.org/${ref.doi}` : "";

  if (style === "apa") {
    const authors = formatAuthorsApa(ref.authors);
    const authorPart = authors ? `${authors} ` : "";
    const journalPart = journal
      ? ` *${journal}*${vol ? `, *${vol}*` : ""}${issue}${pages}.`
      : ".";
    return `${authorPart}(${year}). ${title}.${journalPart}${doi}`.trim();
  }

  if (style === "mla") {
    const authors = formatAuthorsMla(ref.authors);
    const authorPart = authors ? `${authors}. ` : "";
    const journalPart = journal
      ? ` *${journal}*${vol ? `, vol. ${vol}` : ""}${ref.issue ? `, no. ${ref.issue}` : ""}${pages}.`
      : "";
    return `${authorPart}"${title}."${journalPart} ${year}.${doi}`.trim();
  }

  const authors = formatAuthorsChicago(ref.authors);
  const authorPart = authors ? `${authors}. ` : "";
  const journalPart = journal
    ? ` "${title}." *${journal}* ${vol}${ref.issue ? `, no. ${ref.issue}` : ""}${pages} (${year}).`
    : ` "${title}." (${year}).`;
  return `${authorPart}${journalPart}${doi}`.trim();
}
