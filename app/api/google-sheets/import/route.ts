import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { downloadSharedWorkbook, WORKBOOK_MIME } from "@/lib/google-workbook";

export const runtime = "nodejs";

// Downloads the shared data collection workbook as .xlsx so the browser can run it
// through the same extraction pipeline as a manual bulk upload.
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Please log in to sync from Google Sheets." }, { status: 401 });
    }

    const workbook = await downloadSharedWorkbook();

    return new NextResponse(workbook.buffer, {
      headers: {
        "Content-Type": WORKBOOK_MIME,
        "Cache-Control": "no-store",
        "X-File-Id": workbook.fileId,
        "X-File-Name": encodeURIComponent(workbook.name),
        "X-File-Modified": workbook.modifiedTime,
      },
    });
  } catch (error) {
    console.error("Google Sheets import error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to download Google Sheet" },
      { status: 500 }
    );
  }
}
