import type { NextRequest } from "next/server";
import { citesInSuperscript, formatCitationClusters } from "@/lib/cite/csl";
import { CSL_STYLES, isCslStyle } from "@/lib/cite/styles";
import { applyCitations, readDocumentXml, scanMarkers } from "@/lib/manuscript/docx";
import {
  findReferenceIdsByPrefix,
  getReferenceByDoi,
  listReferences,
} from "@/lib/references/queries";
import { jsonError, jsonOk, requireSession } from "@/lib/api/http";

const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Word-manuscript opmaken: tijdelijke citaten ({Meyhoff 2022 #3fa9c1e2}) worden opgemaakte
 * citaten in de gekozen stijl, met een literatuurlijst achteraan. Geeft de nieuwe .docx
 * (base64) en een verslag terug; het origineel wordt niet bewaard.
 */
export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Bestand ontbreekt.", 400);
  if (!file.name.toLowerCase().endsWith(".docx")) {
    return jsonError("Alleen Word-documenten (.docx). Sla een .doc eerst op als .docx.", 400);
  }
  if (file.size > MAX_BYTES) return jsonError("Document is groter dan 20 MB.", 400);
  const styleParam = form.get("style");
  const style = isCslStyle(styleParam) ? styleParam : "vancouver";
  const heading = typeof form.get("heading") === "string" && String(form.get("heading")).trim()
    ? String(form.get("heading")).trim().slice(0, 100)
    : "References";

  let doc: Awaited<ReturnType<typeof readDocumentXml>>;
  try {
    doc = await readDocumentXml(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Document lezen mislukt.", 400);
  }

  const markers = scanMarkers(doc.xml);
  if (markers.length === 0) {
    return jsonError(
      "Geen tijdelijke citaten gevonden. Gebruik {Auteur Jaar #code}; kopieer ze via rechtsklik → Tijdelijk citaat kopiëren.",
      400,
    );
  }

  // Codes en DOI's naar artikelen.
  const parts = markers.flatMap((m) => m.parts);
  const byPrefix = await findReferenceIdsByPrefix(
    session.userId,
    parts.filter((p) => p.kind === "id").map((p) => p.value),
  );
  const byDoi = new Map<string, string>();
  for (const p of parts) {
    if (p.kind !== "doi" || byDoi.has(p.value)) continue;
    const ref = await getReferenceByDoi(session.userId, p.value);
    if (ref && !ref.deletedAt) byDoi.set(p.value, ref.id);
  }
  const resolve = (p: (typeof parts)[number]) => (p.kind === "id" ? byPrefix.get(p.value) : byDoi.get(p.value));

  const unresolved: string[] = [];
  const clusters: (string[] | null)[] = markers.map((m) => {
    const ids = m.parts.map(resolve);
    if (ids.some((id) => !id)) {
      unresolved.push(m.raw);
      return null;
    }
    return [...new Set(ids as string[])];
  });

  // Volgorde van eerste vermelding (bepaalt de nummering bij Vancouver/AMA).
  const order: string[] = [];
  for (const ids of clusters) for (const id of ids ?? []) if (!order.includes(id)) order.push(id);
  const found = await listReferences(session.userId, { ids: order });
  const byId = new Map(found.map((r) => [r.id, r]));
  const refs = order.map((id) => byId.get(id)).filter((r) => r !== undefined);

  const resolvedClusters = clusters.filter((c): c is string[] => c !== null);
  let formatted: ReturnType<typeof formatCitationClusters>;
  try {
    formatted = formatCitationClusters(refs, resolvedClusters, style);
  } catch (e) {
    console.error("[manuscript]", e);
    return jsonError("Opmaken in deze stijl mislukt.", 500);
  }
  let next = 0;
  const citations = clusters.map((c) => (c ? formatted.citations[next++] : null));

  const { buffer, mergedRuns } = await applyCitations(doc.zip, doc.xml, citations, {
    superscript: citesInSuperscript(style),
    bibliography: formatted.bibliography,
    heading,
  });

  const base = file.name.replace(/\.docx$/i, "");
  return jsonOk({
    fileName: `${base} (${CSL_STYLES[style].label}).docx`,
    file: buffer.toString("base64"),
    report: {
      style: CSL_STYLES[style].label,
      citations: markers.length - unresolved.length,
      references: refs.length,
      unresolved,
      mergedRuns,
    },
  });
}
