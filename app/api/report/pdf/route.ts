import { NextResponse } from "next/server";
import { contextFor, loadReportData } from "@/lib/report/load";
import { renderPdf } from "@/lib/report/pdf";
import { finalExportBlockers, renderReportHtml, reportFileName } from "@/lib/report/render";
import { errorResponse, reportRequest } from "@/lib/report/request";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET ?year=2024&mode=draft|final   A4 PDF of the report. Final requires every blocker cleared.
export async function GET(request: Request) {
  const auth = await reportRequest(request);
  if ("error" in auth) return auth.error;

  try {
    const data = await loadReportData(auth.supabase, auth.user, auth.year);
    const mode = new URL(request.url).searchParams.get("mode") === "final" ? "final" : "draft";
    const context = contextFor(data);
    const blockers = finalExportBlockers(data.settings, data.narrative, context.boundary_rows);
    if (mode === "final" && blockers.length > 0) {
      return NextResponse.json({ error: "Report is not ready for final export.", blockers }, { status: 409 });
    }

    const pdf = await renderPdf(renderReportHtml(context, { mode }));
    const fileName = reportFileName(data.settings, data.year).replace(/\.pdf$/, mode === "draft" ? "_DRAFT.pdf" : ".pdf");
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Report PDF error:", error);
    return errorResponse(error);
  }
}
