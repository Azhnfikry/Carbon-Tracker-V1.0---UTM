// Inputs and settings for the GHG inventory report (GHG Protocol Corporate Standard).

// One activity record from the emissions table, quantity in the emission factor's unit.
export interface ActivityRecord {
  scope: number;
  category: string;
  activity_type: string;
  quantity: number;
  unit: string;
  date: string; // YYYY-MM-DD
}

// One emission factor (kg CO2e per unit). co2/ch4/n2o are kg of each gas per unit when the
// factor is published per gas (fuel combustion); otherwise they are null.
export interface FactorRecord {
  scope: number;
  category: string;
  activity_type: string;
  unit: string;
  factor: number;
  co2?: number | null;
  ch4?: number | null;
  n2o?: number | null;
  source?: string | null;
  year?: number | null;
}

// One row of the "Masterlist" tab in the data collection workbook.
export interface MasterlistRow {
  scope_boundary: string; // e.g. "Scope 1 (Direct)"
  category: string; // e.g. "Stationary Combustion"
  description: string;
  activity_inputs: string;
  evidence: string;
  included: string; // "Yes", "Yes, Water Bills", "No, only for ..."
  owner: string;
  remarks: string;
  data_type?: string; // Metered / Invoiced / Estimated when the masterlist provides it
}

// MANUAL fields entered by the consultant or client in the report settings panel.
export interface ReportSettings {
  organisation_name: string;
  campus_name: string;
  campus_address: string;
  contact_email: string;
  base_year: string;
  base_year_rationale: string;
  recalc_threshold_pct: string;
  report_version: string;
  report_date: string;
  prepared_by: string;
  prepared_by_org: string;
  reviewed_by: string;
  approved_by: string;
  assurance_status: string;
  assurance_statement: string;
  platform_name: string;
  organisation_profile: string;
  gross_floor_area_m2: string;
  staff_count: string;
  student_count: string;
  consolidation_approach: string;
  sites_included: string;
  sites_excluded_statement: string;
  assumptions: string;
  // Reason recorded for each boundary category (key = Section 3.2 "Scope / category" label),
  // e.g. why data was not available. Required for every Excluded category before final export.
  boundary_notes: Record<string, string>;
}

export interface RecommendationRow {
  action: string;
  source: string;
  source_tco2e: string;
  effort: string;
  timeframe: string;
}

// Fields drafted by AI and reviewed by the consultant.
export interface NarrativeFields {
  exec_summary_paragraph: string;
  exec_recommendations_paragraph: string;
  hotspot_analysis: string;
  improvement_plan: string;
  recommendations: RecommendationRow[];
}

export type NarrativeKey = keyof NarrativeFields;

export const NARRATIVE_KEYS: NarrativeKey[] = [
  "exec_summary_paragraph",
  "exec_recommendations_paragraph",
  "hotspot_analysis",
  "improvement_plan",
  "recommendations",
];

export interface NarrativeState {
  fields: NarrativeFields;
  approved: Partial<Record<NarrativeKey, boolean>>;
  // Numbers in the AI text that do not appear in the report data, per field.
  flags: Partial<Record<NarrativeKey, string[]>>;
  generated_at?: string;
}

// MANUAL fields that must be filled before the report can be exported as final.
export type TextSettingKey = Exclude<keyof ReportSettings, "boundary_notes">;

export const REQUIRED_SETTINGS: Array<{ key: TextSettingKey; label: string }> = [
  { key: "organisation_name", label: "Organisation name" },
  { key: "campus_name", label: "Campus name" },
  { key: "campus_address", label: "Campus address" },
  { key: "contact_email", label: "Contact email" },
  { key: "base_year", label: "Base year" },
  { key: "base_year_rationale", label: "Base year rationale" },
  { key: "report_version", label: "Report version" },
  { key: "report_date", label: "Report date" },
  { key: "prepared_by", label: "Prepared by" },
  { key: "prepared_by_org", label: "Prepared by (organisation)" },
  { key: "reviewed_by", label: "Reviewed by" },
  { key: "approved_by", label: "Approved by" },
  { key: "assurance_status", label: "Assurance status" },
  { key: "assurance_statement", label: "Assurance statement" },
  { key: "organisation_profile", label: "Organisational profile" },
  { key: "gross_floor_area_m2", label: "Gross floor area (m²)" },
  { key: "staff_count", label: "Staff" },
  { key: "student_count", label: "Students" },
  { key: "consolidation_approach", label: "Consolidation approach" },
  { key: "sites_included", label: "Sites included" },
  { key: "sites_excluded_statement", label: "Sites excluded statement" },
  { key: "assumptions", label: "Key assumptions" },
];

export const emptySettings = (): ReportSettings => ({
  organisation_name: "",
  campus_name: "",
  campus_address: "",
  contact_email: "",
  base_year: "",
  base_year_rationale: "",
  recalc_threshold_pct: "5",
  report_version: "1.0",
  report_date: "",
  prepared_by: "",
  prepared_by_org: "",
  reviewed_by: "",
  approved_by: "",
  assurance_status: "Internal review only – not externally verified",
  assurance_statement: "",
  platform_name: "Aethera Carbon Tracker",
  organisation_profile: "",
  gross_floor_area_m2: "",
  staff_count: "",
  student_count: "",
  consolidation_approach: "",
  sites_included: "",
  sites_excluded_statement: "",
  assumptions: "",
  boundary_notes: {},
});

export const emptyNarrative = (): NarrativeState => ({
  fields: {
    exec_summary_paragraph: "",
    exec_recommendations_paragraph: "",
    hotspot_analysis: "",
    improvement_plan: "",
    recommendations: [],
  },
  approved: {},
  flags: {},
});
