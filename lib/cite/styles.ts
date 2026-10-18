/** Beschikbare CSL-stijlen (bestanden in lib/cite/csl/). Bruikbaar in browser en server. */
export const CSL_STYLES = {
  vancouver: { label: "Vancouver (NLM)", file: "vancouver.csl", numbered: true },
  ama: { label: "AMA 11", file: "american-medical-association.csl", numbered: true },
  nejm: { label: "NEJM", file: "the-new-england-journal-of-medicine.csl", numbered: true },
  apa: { label: "APA 7", file: "apa.csl", numbered: false },
  harvard: { label: "Harvard", file: "harvard-cite-them-right.csl", numbered: false },
  chicago: { label: "Chicago (auteur-datum)", file: "chicago-author-date.csl", numbered: false },
  mla: { label: "MLA 9", file: "modern-language-association.csl", numbered: false },
} as const;

export type CslStyleId = keyof typeof CSL_STYLES;

export const CSL_STYLE_IDS = Object.keys(CSL_STYLES) as CslStyleId[];

export function isCslStyle(value: unknown): value is CslStyleId {
  return typeof value === "string" && value in CSL_STYLES;
}
