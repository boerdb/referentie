import JSZip from "jszip";

/**
 * Tijdelijke citaten in een Word-document (.docx) vervangen door opgemaakte citaten, en een
 * literatuurlijst achteraan, zoals "Scan" in Bookends.
 *
 * Tijdelijk citaat: {Meyhoff 2022 #3fa9c1e2} — de code na # is het begin van het artikel-id.
 * Meerdere in één citaat met ';': {Meyhoff 2022 #3fa9c1e2; Rhodes 2024 #a1b2c3d4}.
 * Ook: {doi:10.1056/NEJMoa2202707}.
 */

export type MarkerPart = { kind: "id"; value: string } | { kind: "doi"; value: string };
export type Marker = { raw: string; parts: MarkerPart[] };

const MARKER = /\{([^{}]{1,600})\}/g;

function parseMarker(inner: string): MarkerPart[] | null {
  const parts: MarkerPart[] = [];
  for (const piece of inner.split(";")) {
    const id = piece.match(/#([0-9a-f]{6,32})\b/i);
    const doi = piece.match(/doi:\s*(10\.\d{4,9}\/\S+)/i);
    if (id) parts.push({ kind: "id", value: id[1].toLowerCase() });
    else if (doi) parts.push({ kind: "doi", value: doi[1].replace(/[.,;]+$/, "").toLowerCase() });
    else if (piece.trim()) return null; // geen tijdelijk citaat, gewoon tekst tussen accolades
  }
  return parts.length > 0 ? parts : null;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function encodeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const PARAGRAPH = /<w:p(?=[ >])[\s\S]*?<\/w:p>/g;
const RUN = /<w:r(?=[ >])[\s\S]*?<\/w:r>/g;
const TEXT = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:t(?:\s[^>]*)?\/>/g;

type Run = { xml: string; rPr: string; open: string; text: string; onlyText: boolean };

function parseRun(xml: string): Run {
  const open = xml.match(/^<w:r(?:\s[^>]*)?>/)?.[0] ?? "<w:r>";
  const rPr = xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>|<w:rPr\/>/)?.[0] ?? "";
  let text = "";
  for (const m of xml.matchAll(TEXT)) text += decodeXml(m[1] ?? "");
  const inner = xml.slice(open.length, -"</w:r>".length).replace(rPr, "");
  // Alleen tekst? Dan kunnen we de run zonder verlies opnieuw opbouwen.
  const onlyText = inner.replace(TEXT, "").replace(/<w:lastRenderedPageBreak\/>/g, "").trim() === "";
  return { xml, rPr, open, text, onlyText };
}

function textRun(open: string, rPr: string, text: string, superscript = false): string {
  if (!text) return "";
  let props = rPr;
  if (superscript) {
    const sup = '<w:vertAlign w:val="superscript"/>';
    props = props
      ? props.replace("<w:rPr/>", `<w:rPr>${sup}</w:rPr>`).replace("</w:rPr>", `${sup}</w:rPr>`)
      : `<w:rPr>${sup}</w:rPr>`;
  }
  return `${open}${props}<w:t xml:space="preserve">${encodeXml(text)}</w:t></w:r>`;
}

/** Alle tijdelijke citaten in documentvolgorde. */
export function scanMarkers(documentXml: string): Marker[] {
  const out: Marker[] = [];
  for (const p of documentXml.match(PARAGRAPH) ?? []) {
    const text = (p.match(RUN) ?? []).map((r) => parseRun(r).text).join("");
    for (const m of text.matchAll(MARKER)) {
      const parts = parseMarker(m[1]);
      if (parts) out.push({ raw: m[0], parts });
    }
  }
  return out;
}

export async function readDocumentXml(buffer: Buffer): Promise<{ zip: JSZip; xml: string }> {
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("Dit is geen Word-document (.docx).");
  return { zip, xml: await file.async("string") };
}

/**
 * Vervangt citaat nr. i (documentvolgorde) door `citations[i]` en zet de literatuurlijst
 * achteraan. Een citaat dat over meerdere stukjes opmaak verspreid staat, wordt eerst in het
 * eerste stukje samengevoegd. Geeft het nieuwe document en het aantal samengevoegde stukjes.
 */
export async function applyCitations(
  zip: JSZip,
  documentXml: string,
  citations: (string | null)[],
  opts: { superscript: boolean; bibliography: string[]; heading: string },
): Promise<{ buffer: Buffer; mergedRuns: number }> {
  let index = 0;
  let mergedRuns = 0;

  const xml = documentXml.replace(PARAGRAPH, (paragraph) => {
    const runXml = paragraph.match(RUN) ?? [];
    let runs = runXml.map(parseRun);
    const full = runs.map((r) => r.text).join("");
    const matches = [...full.matchAll(MARKER)].filter((m) => parseMarker(m[1]));
    if (matches.length === 0) return paragraph;

    // 1. Citaten die over meerdere runs lopen in de eerste run samenvoegen.
    for (const m of matches) {
      const start = m.index!;
      const end = start + m[0].length;
      let pos = 0;
      const covering: number[] = [];
      runs.forEach((r, i) => {
        const rs = pos;
        const re = pos + r.text.length;
        if (r.text.length > 0 && rs < end && re > start) covering.push(i);
        pos = re;
      });
      if (covering.length > 1) {
        const first = covering[0];
        const last = covering[covering.length - 1];
        const joined = runs.slice(first, last + 1).map((r) => r.text).join("");
        runs = runs.map((r, i) => {
          if (i === first) return { ...r, text: joined, onlyText: true };
          if (i > first && i <= last) return { ...r, text: "", onlyText: true };
          return r;
        });
        mergedRuns += covering.length - 1;
      }
    }

    // 2. Per run de citaten vervangen; de run wordt gesplitst rond elk citaat.
    const rebuilt = runs.map((r, i) => {
      const own = [...r.text.matchAll(MARKER)].filter((m) => parseMarker(m[1]));
      const changed = r.text !== parseRun(runXml[i]).text;
      if (own.length === 0 && !changed) return runXml[i];
      if (own.length === 0) return textRun(r.open, r.rPr, r.text);
      let out = "";
      let last = 0;
      for (const m of own) {
        out += textRun(r.open, r.rPr, r.text.slice(last, m.index));
        const citation = citations[index++];
        out += textRun(r.open, r.rPr, citation ?? m[0], Boolean(citation) && opts.superscript);
        last = m.index! + m[0].length;
      }
      out += textRun(r.open, r.rPr, r.text.slice(last));
      return out;
    });

    let result = paragraph;
    runXml.forEach((original, i) => {
      result = result.replace(original, () => rebuilt[i]);
    });
    return result;
  });

  // 3. Literatuurlijst vóór de sectie-instellingen aan het eind van het document.
  const bib = opts.bibliography.length
    ? [
        `<w:p><w:pPr><w:spacing w:before="480" w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">${encodeXml(opts.heading)}</w:t></w:r></w:p>`,
        ...opts.bibliography.map(
          (entry) =>
            `<w:p><w:pPr><w:spacing w:after="80"/><w:ind w:left="360" w:hanging="360"/></w:pPr><w:r><w:t xml:space="preserve">${encodeXml(entry)}</w:t></w:r></w:p>`,
        ),
      ].join("")
    : "";
  const sectAt = xml.lastIndexOf("<w:sectPr");
  const bodyEnd = xml.lastIndexOf("</w:body>");
  const insertAt = sectAt > -1 && sectAt < bodyEnd ? sectAt : bodyEnd;
  const finalXml = insertAt > -1 ? xml.slice(0, insertAt) + bib + xml.slice(insertAt) : xml;

  zip.file("word/document.xml", finalXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { buffer, mergedRuns };
}
