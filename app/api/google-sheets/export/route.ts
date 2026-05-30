import { NextRequest, NextResponse } from "next/server";
import { createSign } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { calculateEmissionSummary } from "@/lib/emission-calculations";
import type { EmissionEntry, StudentCountEntry } from "@/types/emission";

export const runtime = "nodejs";

type SheetRow = Array<string | number>;

const SHEET_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function base64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function normalizePrivateKey(privateKey: string) {
  return privateKey.replace(/\\n/g, "\n");
}

function extractSpreadsheetId(value?: string | null) {
  if (!value) return process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "";
  const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] || value.trim();
}

async function getGoogleAccessToken() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY in environment variables.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: SHEET_SCOPES.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const unsignedToken = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();

  const signature = signer.sign(normalizePrivateKey(privateKey));
  const assertion = `${unsignedToken}.${base64Url(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Failed to authenticate with Google Sheets.");
  }

  return data.access_token as string;
}

async function googleSheetsFetch(path: string, accessToken: string, init?: RequestInit) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || "Google Sheets API request failed.");
  }

  return data;
}

function sheetRange(sheetName: string) {
  return `'${sheetName.replace(/'/g, "''")}'!A1`;
}

function monthKey(dateValue: string) {
  const date = new Date(dateValue);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
  });
}

function buildExportTables(entries: EmissionEntry[], studentEntries: StudentCountEntry[], companyInfo: any) {
  const summary = calculateEmissionSummary(entries);
  const latestStudentCount = [...studentEntries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.students || 0;
  const totalTco2e = summary.totalEmissions / 1000;
  const perStudent = latestStudentCount > 0 ? totalTco2e / latestStudentCount : 0;

  const summaryRows: SheetRow[] = [
    ["Carbon Accounting Export"],
    ["Generated At", new Date().toISOString()],
    ["Company", companyInfo?.company_name || ""],
    ["Reporting Period", companyInfo?.reporting_period || ""],
    [],
    ["Metric", "Value", "Unit"],
    ["Total Emissions", summary.totalEmissions, "kg CO2e"],
    ["Total Emissions", totalTco2e, "tCO2e"],
    ["Scope 1", summary.scope1, "kg CO2e"],
    ["Scope 2", summary.scope2, "kg CO2e"],
    ["Scope 3", summary.scope3, "kg CO2e"],
    ["Latest Student Count", latestStudentCount, "students"],
    ["Emissions Intensity", perStudent, "tCO2e/student"],
  ];

  const categoryRows: SheetRow[] = [
    ["Category", "Emissions", "Unit", "Share of Total"],
    ...Object.entries(summary.byCategory)
      .sort(([, a], [, b]) => b - a)
      .map(([category, value]) => [
        category,
        Number(value.toFixed(4)),
        "kg CO2e",
        summary.totalEmissions > 0 ? Number(((value / summary.totalEmissions) * 100).toFixed(2)) : 0,
      ]),
  ];

  const facilityMap = new Map<string, { emissions: number; count: number }>();
  for (const entry of entries) {
    const facility = entry.facility || "Unassigned";
    const current = facilityMap.get(facility) || { emissions: 0, count: 0 };
    current.emissions += entry.co2_equivalent || entry.co2Equivalent || 0;
    current.count += 1;
    facilityMap.set(facility, current);
  }

  const facilityRows: SheetRow[] = [
    ["Facility", "Entries", "Emissions", "Unit", "Share of Total"],
    ...[...facilityMap.entries()]
      .sort(([, a], [, b]) => b.emissions - a.emissions)
      .map(([facility, data]) => [
        facility,
        data.count,
        Number(data.emissions.toFixed(4)),
        "kg CO2e",
        summary.totalEmissions > 0 ? Number(((data.emissions / summary.totalEmissions) * 100).toFixed(2)) : 0,
      ]),
  ];

  const monthly = new Map<string, { total: number; scope1: number; scope2: number; scope3: number }>();
  for (const entry of entries) {
    const key = monthKey(entry.date);
    const current = monthly.get(key) || { total: 0, scope1: 0, scope2: 0, scope3: 0 };
    current.total += entry.co2_equivalent || 0;
    if (entry.scope === 1) current.scope1 += entry.co2_equivalent || 0;
    if (entry.scope === 2) current.scope2 += entry.co2_equivalent || 0;
    if (entry.scope === 3) current.scope3 += entry.co2_equivalent || 0;
    monthly.set(key, current);
  }

  const sortedStudents = [...studentEntries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const getStudentsForMonth = (key: string) => {
    const [year, month] = key.split("-");
    const monthEnd = new Date(Number(year), Number(month), 0).getTime();
    const latest = sortedStudents.filter((entry) => new Date(entry.date).getTime() <= monthEnd).at(-1);
    return latest?.students || sortedStudents.at(-1)?.students || 0;
  };

  const monthlyRows: SheetRow[] = [
    ["Month", "Total kg CO2e", "Scope 1 kg CO2e", "Scope 2 kg CO2e", "Scope 3 kg CO2e", "Students", "tCO2e/student"],
    ...[...monthly.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, data]) => {
        const students = getStudentsForMonth(key);
        return [
          monthLabel(key),
          Number(data.total.toFixed(4)),
          Number(data.scope1.toFixed(4)),
          Number(data.scope2.toFixed(4)),
          Number(data.scope3.toFixed(4)),
          students,
          students > 0 ? Number(((data.total / 1000) / students).toFixed(8)) : "",
        ];
      }),
  ];

  const studentRows: SheetRow[] = [
    ["Date", "Students", "Description"],
    ...[...studentEntries]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((entry) => [entry.date, entry.students, entry.description || ""]),
  ];

  return {
    "GHG Summary": summaryRows,
    "Monthly Analytics": monthlyRows,
    "Category Breakdown": categoryRows,
    "Facility Breakdown": facilityRows,
    "Student Counts": studentRows,
  };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const spreadsheetId = extractSpreadsheetId(body.spreadsheetId);

    if (!spreadsheetId) {
      return NextResponse.json({ error: "Google Sheet URL or spreadsheet ID is required." }, { status: 400 });
    }

    const [{ data: emissions, error: emissionsError }, { data: studentCounts, error: studentError }, { data: companyInfo }] =
      await Promise.all([
        supabase.from("emissions").select("*").eq("user_id", user.id).order("date", { ascending: true }),
        supabase.from("student_counts").select("*").eq("user_id", user.id).order("date", { ascending: true }),
        supabase.from("company_info").select("*").eq("user_id", user.id).maybeSingle(),
      ]);

    if (emissionsError) throw emissionsError;
    if (studentError) throw studentError;

    const accessToken = await getGoogleAccessToken();
    const workbook = await googleSheetsFetch(`${spreadsheetId}?fields=sheets.properties.title`, accessToken);
    const existingSheets = new Set<string>((workbook.sheets || []).map((sheet: any) => sheet.properties.title));
    const tables = buildExportTables((emissions || []) as EmissionEntry[], (studentCounts || []) as StudentCountEntry[], companyInfo);
    const missingSheets = Object.keys(tables).filter((sheetName) => !existingSheets.has(sheetName));

    if (missingSheets.length > 0) {
      await googleSheetsFetch(`${spreadsheetId}:batchUpdate`, accessToken, {
        method: "POST",
        body: JSON.stringify({
          requests: missingSheets.map((title) => ({ addSheet: { properties: { title } } })),
        }),
      });
    }

    await googleSheetsFetch(`${spreadsheetId}/values:batchClear`, accessToken, {
      method: "POST",
      body: JSON.stringify({
        ranges: Object.keys(tables).map((name) => `'${name.replace(/'/g, "''")}'!A:Z`),
      }),
    });

    await googleSheetsFetch(`${spreadsheetId}/values:batchUpdate`, accessToken, {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: Object.entries(tables).map(([name, values]) => ({
          range: sheetRange(name),
          values,
        })),
      }),
    });

    return NextResponse.json({
      success: true,
      spreadsheetId,
      sheets: Object.keys(tables),
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    });
  } catch (error) {
    console.error("Google Sheets export error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export to Google Sheets" },
      { status: 500 }
    );
  }
}
