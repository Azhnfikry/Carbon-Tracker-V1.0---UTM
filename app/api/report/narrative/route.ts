import { NextResponse } from "next/server";
import { contextFor, loadReportData, saveReportData } from "@/lib/report/load";
import { draftNarrative } from "@/lib/report/narrative";
import { finalExportBlockers } from "@/lib/report/render";
import { errorResponse, reportRequest } from "@/lib/report/request";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST ?year=2024   drafts the AI fields from the calculated report data. Drafts start unapproved.
export async function POST(request: Request) {
  const auth = await reportRequest(request);
  if ("error" in auth) return auth.error;

  try {
    const data = await loadReportData(auth.supabase, auth.user, auth.year);
    const context = contextFor(data);
    const narrative = await draftNarrative(context);
    await saveReportData(auth.supabase, auth.user, auth.year, { settings: data.settings, narrative });
    return NextResponse.json({ narrative, blockers: finalExportBlockers(data.settings, narrative, context.boundary_rows) });
  } catch (error) {
    console.error("Narrative draft error:", error);
    return errorResponse(error);
  }
}
