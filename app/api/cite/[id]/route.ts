import type { NextRequest } from "next/server";
import { getReference } from "@/lib/references/queries";
import { formatCitation, type CiteStyle } from "@/lib/cite/formats";
import { jsonError, jsonOk, requireSession } from "@/lib/api/http";

type Ctx = { params: Promise<{ id: string }> };

const STYLES: CiteStyle[] = ["apa", "mla", "chicago"];

export async function GET(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const styleParam = (req.nextUrl.searchParams.get("style") ??
    "apa") as CiteStyle;
  const style = STYLES.includes(styleParam) ? styleParam : "apa";

  const item = await getReference(session.userId, id);
  if (!item) return jsonError("Niet gevonden.", 404);

  return jsonOk({ style, citation: formatCitation(item, style) });
}
