import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractGoogleFileId, getGoogleAccessToken, GOOGLE_SCOPES } from "@/lib/google-auth";

export const runtime = "nodejs";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";

async function driveFetch(path: string, accessToken: string) {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${path}${separator}supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 404) {
      throw new Error(
        `Google Sheet not found. Share it with ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL} (Viewer access) and try again.`
      );
    }
    throw new Error(data.error?.message || "Google Drive request failed.");
  }

  return response;
}

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

    const fileId = extractGoogleFileId(process.env.GOOGLE_SHEETS_IMPORT_FILE_ID);
    if (!fileId) {
      return NextResponse.json({ error: "GOOGLE_SHEETS_IMPORT_FILE_ID is not configured." }, { status: 500 });
    }

    const accessToken = await getGoogleAccessToken([GOOGLE_SCOPES.driveReadonly]);
    const metadata = await (await driveFetch(`${fileId}?fields=name,mimeType,modifiedTime`, accessToken)).json();

    // Native Google Sheets must be exported; uploaded Excel files are downloaded as-is.
    const download =
      metadata.mimeType === GOOGLE_SHEET_MIME
        ? await driveFetch(`${fileId}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`, accessToken)
        : await driveFetch(`${fileId}?alt=media`, accessToken);

    const fileName = /\.xlsx?$/i.test(metadata.name) ? metadata.name : `${metadata.name}.xlsx`;

    return new NextResponse(await download.arrayBuffer(), {
      headers: {
        "Content-Type": XLSX_MIME,
        "Cache-Control": "no-store",
        "X-File-Id": fileId,
        "X-File-Name": encodeURIComponent(fileName),
        "X-File-Modified": metadata.modifiedTime || "",
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
