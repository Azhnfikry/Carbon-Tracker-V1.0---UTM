import type { SupabaseClient, User } from "@supabase/supabase-js";
import { mergeEmissionFactorsWithLocalDefinitions } from "@/lib/emission-factor-sync";
import { downloadSharedWorkbook } from "@/lib/google-workbook";
import { buildReportContext } from "@/lib/report/build-context";
import { formatDate } from "@/lib/report/format";
import { parseMasterlistBuffer } from "@/lib/report/masterlist";
import {
  emptyNarrative,
  emptySettings,
  type ActivityRecord,
  type FactorRecord,
  type MasterlistRow,
  type NarrativeState,
  type ReportSettings,
} from "@/lib/report/types";

type CompanyInfo = Record<string, string | number | null | undefined>;

function parseConsolidation(value: unknown) {
  const text = String(value || "");
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.join(", ");
  } catch {
    // stored as plain text
  }
  return text;
}

function metricValue(metrics: unknown, pattern: RegExp) {
  try {
    const parsed = JSON.parse(String(metrics || "[]"));
    if (!Array.isArray(parsed)) return "";
    const metric = parsed.find((item) => pattern.test(String(item?.name || item?.metric || "")));
    return metric?.value ? String(metric.value) : "";
  } catch {
    return "";
  }
}

// Report settings prefilled from Company Info and the user profile; saved values take priority.
export function defaultSettings(company: CompanyInfo | null, profile: { full_name?: string | null; email?: string | null } | null): ReportSettings {
  const settings = emptySettings();
  if (company) {
    const address = [company.facility_address_line_1, company.facility_address_line_2, company.facility_postcode, company.facility_state]
      .filter(Boolean)
      .join(", ");
    settings.organisation_name = String(company.company_name || "");
    settings.campus_address = address;
    settings.consolidation_approach = parseConsolidation(company.consolidation_approach);
    settings.base_year = company.base_year ? String(company.base_year) : "";
    settings.base_year_rationale = String(company.base_year_rationale || "");
    settings.organisation_profile = String(company.business_description || company.company_description || "");
    settings.staff_count = metricValue(company.organization_metrics, /staff|employee/i);
    settings.student_count = metricValue(company.organization_metrics, /student/i);
    settings.gross_floor_area_m2 = metricValue(company.organization_metrics, /floor area|gfa/i);
  }
  settings.prepared_by = profile?.full_name || "";
  settings.contact_email = profile?.email || "";
  settings.report_date = formatDate(new Date());
  return settings;
}

// Emissions for the report years, paged because the API returns at most 1,000 rows per request.
async function loadEmissions(supabase: SupabaseClient, userId: string, from: string, to: string) {
  const rows: Array<Record<string, unknown>> = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("emissions")
      .select("scope, category, activity_type, quantity, unit, date")
      .eq("user_id", userId)
      .gte("date", from)
      .lte("date", to)
      .order("date")
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Failed to load emissions: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

export interface ReportData {
  year: number;
  settings: ReportSettings;
  narrative: NarrativeState;
  activities: ActivityRecord[];
  factors: FactorRecord[];
  masterlist: MasterlistRow[];
  warnings: string[];
  saved: boolean;
}

export async function loadReportData(supabase: SupabaseClient, user: User, year: number): Promise<ReportData> {
  const warnings: string[] = [];

  const [factors, company, profile, saved] = await Promise.all([
    supabase.from("emission_factors").select("*"),
    supabase.from("company_info").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle(),
    supabase.from("inventory_reports").select("settings, narrative").eq("user_id", user.id).eq("reporting_year", year).maybeSingle(),
  ]);

  if (factors.error) throw new Error(`Failed to load emission factors: ${factors.error.message}`);
  if (saved.error) warnings.push(`Saved report settings could not be loaded (${saved.error.message}). Has the inventory_reports migration been run?`);

  let masterlist: MasterlistRow[] = [];
  try {
    masterlist = parseMasterlistBuffer((await downloadSharedWorkbook()).buffer);
    if (masterlist.length === 0) warnings.push('No "Masterlist" tab found in the data collection workbook.');
  } catch (error) {
    warnings.push(`Masterlist could not be read from Google Sheets: ${error instanceof Error ? error.message : String(error)}`);
  }

  const defaults = defaultSettings(company.data as CompanyInfo | null, profile.data ?? { email: user.email });
  const settings = { ...defaults, ...((saved.data?.settings || {}) as Partial<ReportSettings>) };
  const baseYear = Number(settings.base_year);
  const firstYear = baseYear && baseYear < year ? baseYear : year;
  const emissions = await loadEmissions(supabase, user.id, `${firstYear}-01-01`, `${year}-12-31`);

  const savedNarrative = (saved.data?.narrative || {}) as Partial<NarrativeState>;
  const blankNarrative = emptyNarrative();

  return {
    year,
    settings,
    narrative: {
      ...blankNarrative,
      ...savedNarrative,
      fields: { ...blankNarrative.fields, ...(savedNarrative.fields || {}) },
    },
    activities: emissions.map((row) => ({
      scope: Number(row.scope),
      category: String(row.category || ""),
      activity_type: String(row.activity_type || ""),
      quantity: Number(row.quantity) || 0,
      unit: String(row.unit || ""),
      date: String(row.date || ""),
    })),
    factors: mergeEmissionFactorsWithLocalDefinitions(factors.data || []) as unknown as FactorRecord[],
    masterlist,
    warnings,
    saved: Boolean(saved.data),
  };
}

export function contextFor(data: ReportData) {
  return buildReportContext({
    reportingYear: data.year,
    activities: data.activities,
    factors: data.factors,
    masterlist: data.masterlist,
    settings: data.settings,
    narrative: data.narrative.fields,
  });
}

export async function saveReportData(
  supabase: SupabaseClient,
  user: User,
  year: number,
  values: { settings?: ReportSettings; narrative?: NarrativeState }
) {
  const { error } = await supabase.from("inventory_reports").upsert(
    { user_id: user.id, reporting_year: year, ...values, updated_at: new Date().toISOString() },
    { onConflict: "user_id,reporting_year" }
  );
  if (error) throw new Error(`Failed to save report: ${error.message}`);
}
