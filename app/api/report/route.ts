import { NextResponse } from "next/server";
import { contextFor, loadReportData, saveReportData } from "@/lib/report/load";
import { validateNarrative } from "@/lib/report/narrative";
import { finalExportBlockers, renderReportHtml } from "@/lib/report/render";
import { errorResponse, reportRequest } from "@/lib/report/request";
import type { NarrativeState, ReportSettings } from "@/lib/report/types";

export const runtime = "nodejs";

// GET ?year=2024                         report settings, AI drafts and final-export blockers
// GET ?year=2024&format=html&mode=draft  rendered report HTML (draft or final)
export async function GET(request: Request) {
  const auth = await reportRequest(request);
  if ("error" in auth) return auth.error;

  try {
    const data = await loadReportData(auth.supabase, auth.user, auth.year);
    const context = contextFor(data);
    const blockers = finalExportBlockers(data.settings, data.narrative, context.boundary_rows);
    const params = new URL(request.url).searchParams;

    if (params.get("format") === "html") {
      const mode = params.get("mode") === "final" ? "final" : "draft";
      if (mode === "final" && blockers.length > 0) {
        return NextResponse.json({ error: "Report is not ready for final export.", blockers }, { status: 409 });
      }
      return new NextResponse(renderReportHtml(context, { mode }), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    return NextResponse.json({
      year: data.year,
      settings: data.settings,
      narrative: data.narrative,
      blockers,
      warnings: data.warnings,
      saved: data.saved,
      sources: context.source_rows.map((row) => row.source),
      boundary: context.boundary_rows,
      summary: {
        total_tco2e: context.total_tco2e,
        scope1_tco2e: context.scope1_tco2e,
        scope2_tco2e: context.scope2_tco2e,
        scope3_tco2e: context.scope3_tco2e,
        outside_scopes_tco2e: context.outside_scopes_tco2e,
        excluded: context.boundary_rows.filter((row) => row.status === "Excluded").map((row) => row.scope_category),
      },
    });
  } catch (error) {
    console.error("Report load error:", error);
    return errorResponse(error);
  }
}

// PUT ?year=2024 { settings?, narrative? }   saves MANUAL fields and reviewed AI drafts.
export async function PUT(request: Request) {
  const auth = await reportRequest(request);
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as { settings?: ReportSettings; narrative?: NarrativeState };
    const data = await loadReportData(auth.supabase, auth.user, auth.year);
    const settings = body.settings ? { ...data.settings, ...body.settings } : data.settings;
    let narrative = data.narrative;
    if (body.narrative) {
      narrative = { ...data.narrative, ...body.narrative, fields: { ...data.narrative.fields, ...body.narrative.fields } };
    }
    const context = contextFor({ ...data, settings, narrative });
    // Edited text is checked again for numbers that are not in the report data.
    if (body.narrative) narrative.flags = validateNarrative(narrative.fields, context);

    await saveReportData(auth.supabase, auth.user, auth.year, { settings, narrative });
    return NextResponse.json({
      settings,
      narrative,
      boundary: context.boundary_rows,
      blockers: finalExportBlockers(settings, narrative, context.boundary_rows),
    });
  } catch (error) {
    console.error("Report save error:", error);
    return errorResponse(error);
  }
}
