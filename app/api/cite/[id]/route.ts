import type { NextRequest } from "next/server";
import { formatBibliography, stripNumber } from "@/lib/cite/csl";
import { isCslStyle, type CslStyleId } from "@/lib/cite/styles";
import { getReference } from "@/lib/references/queries";
import { jsonError, jsonOk, requireSession } from "@/lib/api/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const param = req.nextUrl.searchParams.get("style");
  const style: CslStyleId = isCslStyle(param) ? param : "vancouver";

  const item = await getReference(session.userId, id);
  if (!item) return jsonError("Niet gevonden.", 404);

  try {
    const bib = formatBibliography([item], style);
    const html = bib.html
      // Nummerkolom van nummerstijlen weglaten bij één bron.
      .replace(/<div class="csl-left-margin">[^<]*<\/div>/g, "")
      .replace(/<div class="csl-right-inline">([\s\S]*?)<\/div>/g, "$1");
    return jsonOk({ style, citation: stripNumber(bib.text), html });
  } catch (e) {
    console.error("[cite]", e);
    return jsonError("Opmaken in deze stijl mislukt.", 500);
  }
}
