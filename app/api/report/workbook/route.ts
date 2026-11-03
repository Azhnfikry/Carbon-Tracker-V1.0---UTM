import { NextResponse } from "next/server";
import { loadWorkbookData } from "@/lib/report/load";
import { errorResponse, reportRequest } from "@/lib/report/request";
import { buildCalculationWorkbook, calculationWorkbookFileName } from "@/lib/report/workbook";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET   Excel workbook with every year's calculation as linked formulas, for rechecking.
export async function GET(request: Request) {
  const auth = await reportRequest(request);
  if ("error" in auth) return auth.error;

  try {
    const data = await loadWorkbookData(auth.supabase, auth.user);
    if (data.activities.length === 0) return errorResponse(new Error("No emission data to export yet."), 404);

    const { buffer, years } = await buildCalculationWorkbook(data);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${calculationWorkbookFileName(data.organisationName, years)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Calculation workbook error:", error);
    return errorResponse(error);
  }
}
