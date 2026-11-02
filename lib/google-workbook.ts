import { extractGoogleFileId, getGoogleAccessToken, GOOGLE_SCOPES } from "@/lib/google-auth";

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

export const WORKBOOK_MIME = XLSX_MIME;

// Downloads the shared data collection workbook (GOOGLE_SHEETS_IMPORT_FILE_ID) as .xlsx.
export async function downloadSharedWorkbook() {
  const fileId = extractGoogleFileId(process.env.GOOGLE_SHEETS_IMPORT_FILE_ID);
  if (!fileId) throw new Error("GOOGLE_SHEETS_IMPORT_FILE_ID is not configured.");

  const accessToken = await getGoogleAccessToken([GOOGLE_SCOPES.driveReadonly]);
  const metadata = await (await driveFetch(`${fileId}?fields=name,mimeType,modifiedTime`, accessToken)).json();

  // Native Google Sheets must be exported; uploaded Excel files are downloaded as-is.
  const download =
    metadata.mimeType === GOOGLE_SHEET_MIME
      ? await driveFetch(`${fileId}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`, accessToken)
      : await driveFetch(`${fileId}?alt=media`, accessToken);

  return {
    fileId,
    name: /\.xlsx?$/i.test(metadata.name) ? metadata.name : `${metadata.name}.xlsx`,
    modifiedTime: (metadata.modifiedTime as string) || "",
    buffer: await download.arrayBuffer(),
  };
}
