import { GWP_CH4, GWP_N2O, GWP_SET } from "@/lib/emission-calculations";
import {
  formatActivity,
  formatDate,
  formatInteger,
  formatPercent,
  formatTonnes,
  roundedShares,
} from "@/lib/report/format";
import type {
  ActivityRecord,
  FactorRecord,
  MasterlistRow,
  NarrativeFields,
  ReportSettings,
} from "@/lib/report/types";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const NO_DATA_JUSTIFICATION = "Data not available for reporting period; to be collected for next inventory";

// HCFCs controlled under the Montreal Protocol are reported outside the scopes.
const OUTSIDE_SCOPE_PATTERN = /\bR-?(22|123|124|141b|142b)\b|HCFC/i;

// GHG Protocol category for each masterlist data category, plus the emissions-table
// categories that feed it.
const GHG_CATEGORIES: Array<{ masterlist: RegExp; activity: RegExp; label: (scope: number) => string; group: string }> = [
  { masterlist: /stationary/i, activity: /stationary/i, label: () => "Scope 1 – Stationary combustion", group: "Stationary combustion" },
  { masterlist: /mobile/i, activity: /mobile/i, label: () => "Scope 1 – Mobile combustion", group: "Mobile combustion" },
  { masterlist: /fugitive|refrigerant/i, activity: /refrigerant|fugitive/i, label: () => "Scope 1 – Fugitive emissions (refrigerants)", group: "Refrigerants" },
  { masterlist: /electricity/i, activity: /electricity/i, label: () => "Scope 2 – Purchased electricity", group: "Purchased electricity" },
  { masterlist: /purchased goods/i, activity: /water supply|purchased goods/i, label: () => "Scope 3 – Cat. 1 Purchased goods and services", group: "Water supply" },
  { masterlist: /waste/i, activity: /waste|water treatment/i, label: () => "Scope 3 – Cat. 5 Waste generated in operations", group: "Waste" },
  { masterlist: /business travel/i, activity: /business travel|flight/i, label: () => "Scope 3 – Cat. 6 Business travel", group: "Business travel" },
  { masterlist: /commut/i, activity: /commut/i, label: () => "Scope 3 – Cat. 7 Employee commuting", group: "Employee commuting" },
];

const SOURCE_NAMES: Array<[RegExp, string]> = [
  [/^diesel/i, "Diesel"],
  [/^petrol/i, "Petrol"],
  [/^natural gas/i, "Natural gas"],
  [/^lpg/i, "LPG"],
  [/electricity bill/i, "Grid electricity"],
  [/solar generation/i, "Solar generation"],
  [/water purchased/i, "Purchased water"],
  [/^water \(m3\)/i, "Wastewater treatment"],
  [/solid waste \(landfill\)/i, "Solid waste to landfill"],
  [/kitar semula/i, "Recycled waste (Kitar Semula)"],
  [/sisa landskap/i, "Landscape waste (Sisa Landskap)"],
  [/food waste/i, "Food waste"],
];

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/\((kg|kwh|m3|litre|liter|unit|head|acre|mmbtu)\)\s*$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const UNIT_LABELS: Record<string, string> = { kwh: "kWh", kg: "kg", litre: "litre", liter: "litre", l: "litre", m3: "m³", mmbtu: "MMBtu", tonne: "tonne" };

// Display form of an activity unit. Refrigerant top-ups are always reported in kg.
function displayUnit(unit: string, activityType: string) {
  if (/refrigerant/i.test(activityType) && !/kg/i.test(unit)) return "kg";
  return UNIT_LABELS[unit.trim().toLowerCase()] || unit;
}

const scopeOf = (scopeBoundary: string) => Number(scopeBoundary.match(/scope\s*(\d)/i)?.[1] || 0);

function sourceName(record: { activity_type: string; category: string; scope: number }) {
  const known = SOURCE_NAMES.find(([pattern]) => pattern.test(record.activity_type))?.[1];
  const base = known || record.activity_type.replace(/^total\s+/i, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (record.scope === 1 && /stationary/i.test(record.category)) return `${base} – stationary combustion`;
  if (record.scope === 1 && /mobile/i.test(record.category)) return `${base} – vehicles`;
  return base;
}

function ghgCategory(scope: number, activityCategory: string) {
  return GHG_CATEGORIES.find((entry) => entry.activity.test(activityCategory));
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function formatFactor(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 6 }).format(value);
}

const formatGas = (tonnes: number) => (tonnes === 0 ? "–" : formatTonnes(tonnes));

const consolidationLabel = (value: string) => {
  const lower = value.toLowerCase();
  if (lower.includes("operational")) return "Operational control";
  if (lower.includes("financial")) return "Financial control";
  if (lower.includes("equity")) return "Equity share";
  return value;
};

export interface InventoryInput {
  reportingYear: number;
  activities: ActivityRecord[]; // every stored activity record; filtered to the period here
  factors: FactorRecord[];
  masterlist: MasterlistRow[];
  settings: ReportSettings;
  narrative?: NarrativeFields;
  // Scope 2 market-based total (kg CO2e), only when market-based data exists.
  scope2MarketKg?: number | null;
}

// One emission source (scope + activity type) and its results for the reporting period.
export interface SourceResult {
  key: string;
  scope: number;
  category: string; // GHG Protocol category label, e.g. "Scope 2 – Purchased electricity"
  group: string; // gas table group
  name: string;
  activityType: string;
  unit: string;
  monthlyActivity: Array<number | null>;
  monthlyKg: number[];
  activity: number;
  kg: number;
  tonnes: number;
  factor: FactorRecord | null;
  effectiveFactor: number; // kg CO2e per unit
  gasSplit: boolean;
  co2T: number;
  ch4T: number;
  n2oT: number;
  hfcT: number;
  unsplitT: number;
  outsideScopes: boolean;
  monthsCovered: number;
}

// Raw (unformatted) results; every formatted value in the template context comes from these.
export interface InventoryTotals {
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
  outsideScopes: number;
  gas: { co2: number; ch4: number; n2o: number; hfc: number; unsplit: number };
  monthlyByScope: Array<{ month: string; scope1: number; scope2: number; scope3: number }>;
  sources: SourceResult[];
}

function findFactor(factors: FactorRecord[], scope: number, activityType: string) {
  const key = normalize(activityType);
  return factors.find((factor) => factor.scope === scope && normalize(factor.activity_type) === key) || null;
}

const hasGasFactors = (factor: FactorRecord | null) =>
  Boolean(factor && [factor.co2, factor.ch4, factor.n2o].some((value) => typeof value === "number"));

// Calculates the inventory for one calendar year. Emissions = activity x factor. Factors given
// per gas are converted with AR5 GWPs, the same as the bulk upload calculation.
export function calculateInventory(reportingYear: number, activities: ActivityRecord[], factors: FactorRecord[]): InventoryTotals {
  const prefix = String(reportingYear);
  const sources = new Map<string, SourceResult>();

  for (const record of activities) {
    if (!String(record.date).startsWith(prefix)) continue;
    const month = Number(String(record.date).slice(5, 7)) - 1;
    if (month < 0 || month > 11) continue;

    const key = `${record.scope}|${normalize(record.activity_type)}`;
    let source = sources.get(key);
    if (!source) {
      const factor = findFactor(factors, record.scope, record.activity_type);
      const category = ghgCategory(record.scope, record.category);
      const gasSplit = hasGasFactors(factor);
      const effectiveFactor = gasSplit
        ? (factor!.co2 || 0) + (factor!.ch4 || 0) * GWP_CH4 + (factor!.n2o || 0) * GWP_N2O
        : factor?.factor || 0;
      source = {
        key,
        scope: record.scope,
        category: category?.label(record.scope) || `Scope ${record.scope} – ${record.category}`,
        group: category?.group || record.category,
        name: sourceName(record),
        activityType: record.activity_type,
        unit: displayUnit(factor?.unit || record.unit, record.activity_type),
        monthlyActivity: Array(12).fill(null),
        monthlyKg: Array(12).fill(0),
        activity: 0,
        kg: 0,
        tonnes: 0,
        factor,
        effectiveFactor,
        gasSplit,
        co2T: 0,
        ch4T: 0,
        n2oT: 0,
        hfcT: 0,
        unsplitT: 0,
        outsideScopes: record.scope === 1 && OUTSIDE_SCOPE_PATTERN.test(record.activity_type),
        monthsCovered: 0,
      };
      sources.set(key, source);
    }

    const quantity = Number(record.quantity) || 0;
    source.monthlyActivity[month] = (source.monthlyActivity[month] || 0) + quantity;
    source.monthlyKg[month] += quantity * source.effectiveFactor;
    source.activity += quantity;
  }

  const results = Array.from(sources.values());
  for (const source of results) {
    source.kg = source.activity * source.effectiveFactor;
    source.tonnes = source.kg / 1000;
    source.monthsCovered = source.monthlyActivity.filter((value) => value !== null).length;
    if (source.outsideScopes) continue;
    if (source.gasSplit && source.factor) {
      source.co2T = (source.activity * (source.factor.co2 || 0)) / 1000;
      source.ch4T = (source.activity * (source.factor.ch4 || 0) * GWP_CH4) / 1000;
      source.n2oT = (source.activity * (source.factor.n2o || 0) * GWP_N2O) / 1000;
    } else if (source.group === "Refrigerants") {
      source.hfcT = source.tonnes;
    } else {
      source.unsplitT = source.tonnes;
    }
  }

  results.sort((a, b) => a.scope - b.scope || b.tonnes - a.tonnes);
  const inScope = results.filter((source) => !source.outsideScopes);
  const sumBy = (list: SourceResult[], pick: (source: SourceResult) => number) => list.reduce((sum, s) => sum + pick(s), 0);
  const scopeTotal = (scope: number) => sumBy(inScope.filter((s) => s.scope === scope), (s) => s.tonnes);

  return {
    scope1: scopeTotal(1),
    scope2: scopeTotal(2),
    scope3: scopeTotal(3),
    total: sumBy(inScope, (s) => s.tonnes),
    outsideScopes: sumBy(results.filter((s) => s.outsideScopes), (s) => s.tonnes),
    gas: {
      co2: sumBy(inScope, (s) => s.co2T),
      ch4: sumBy(inScope, (s) => s.ch4T),
      n2o: sumBy(inScope, (s) => s.n2oT),
      hfc: sumBy(inScope, (s) => s.hfcT),
      unsplit: sumBy(inScope, (s) => s.unsplitT),
    },
    monthlyByScope: MONTHS.map((month, index) => ({
      month,
      scope1: sumBy(inScope.filter((s) => s.scope === 1), (s) => s.monthlyKg[index] / 1000),
      scope2: sumBy(inScope.filter((s) => s.scope === 2), (s) => s.monthlyKg[index] / 1000),
      scope3: sumBy(inScope.filter((s) => s.scope === 3), (s) => s.monthlyKg[index] / 1000),
    })),
    sources: results,
  };
}

type BoundaryStatus = "Included" | "Excluded" | "Not applicable";

export interface BoundaryResult {
  scope_category: string;
  sources: string;
  status: BoundaryStatus;
  basis: string; // automatic justification from the data and masterlist
  reason: string; // reason recorded by the consultant (settings.boundary_notes)
  justification: string; // basis + recorded reason, as printed in Section 3.2
}

const missingMonths = (matched: SourceResult[]) =>
  MONTHS.filter((_, index) => matched.every((source) => source.monthlyActivity[index] === null));

// Section 3.2 rows. Each row's justification combines the automatic basis (data coverage,
// masterlist status, data owner) with the reason recorded for that category in the report details.
function buildBoundary(masterlist: MasterlistRow[], sources: SourceResult[], notes: Record<string, string> = {}): BoundaryResult[] {
  const rows: BoundaryResult[] = [];
  const covered = new Set<SourceResult>();

  for (const entry of masterlist) {
    const scope = scopeOf(entry.scope_boundary);
    if (!scope) continue; // e.g. the carbon intensity population row

    const category = GHG_CATEGORIES.find((item) => item.masterlist.test(entry.category));
    const label = category?.label(scope) || `Scope ${scope} – ${entry.category}`;
    const matched = sources.filter((source) => source.scope === scope && source.category === label);
    matched.forEach((source) => covered.add(source));

    const included = entry.included.toLowerCase();
    let status: BoundaryStatus;
    let basis: string;
    if (/^(n\/?a|not applicable)/.test(included)) {
      status = "Not applicable";
      basis = entry.remarks || "Not applicable to campus operations.";
    } else if (included.startsWith("yes")) {
      if (matched.length > 0) {
        const missing = missingMonths(matched);
        status = "Included";
        basis =
          missing.length === 0
            ? "Activity data submitted for 12 of 12 months."
            : `Activity data submitted for ${12 - missing.length} of 12 months (no data: ${missing.join(", ")}).`;
      } else {
        status = "Excluded";
        basis = `${NO_DATA_JUSTIFICATION}.${entry.owner && !/^tbc$/i.test(entry.owner) ? ` Data owner: ${entry.owner.replace(/\s*-\s*$/, "")}.` : ""}`;
      }
    } else {
      status = "Excluded";
      basis = entry.remarks || `Excluded in the data collection masterlist (${entry.included || "no status given"}).`;
    }

    rows.push({
      scope_category: label,
      sources: matched.length > 0 ? matched.map((source) => source.name).join(", ") : entry.category,
      status,
      basis,
      reason: "",
      justification: "",
    });
  }

  // Data submitted for a category the masterlist does not list.
  for (const source of sources) {
    if (covered.has(source)) continue;
    const existing = rows.find((row) => row.scope_category === source.category);
    if (existing) {
      existing.sources = `${existing.sources}, ${source.name}`;
      continue;
    }
    rows.push({
      scope_category: source.category,
      sources: source.name,
      status: "Included",
      basis: "Activity data submitted; category not listed in the data collection masterlist.",
      reason: "",
      justification: "",
    });
  }

  for (const row of rows) {
    row.reason = (notes[row.scope_category] || "").trim();
    row.justification = row.reason ? `${row.basis} Reason: ${row.reason}` : row.basis;
  }

  return rows.sort((a, b) => a.scope_category.localeCompare(b.scope_category));
}

function masterlistEntryFor(masterlist: MasterlistRow[], source: SourceResult) {
  return masterlist.find((entry) => {
    const scope = scopeOf(entry.scope_boundary);
    const category = GHG_CATEGORIES.find((item) => item.masterlist.test(entry.category));
    return scope === source.scope && (category?.label(scope) || `Scope ${scope} – ${entry.category}`) === source.category;
  });
}

function buildDataGaps(sources: SourceResult[], boundary: BoundaryResult[], dataTypes: Map<string, string>) {
  const gaps: Array<{ source: string; issue: string; effect: string }> = [];

  for (const source of sources) {
    if (source.monthsCovered < 12) {
      const missing = MONTHS.filter((_, index) => source.monthlyActivity[index] === null);
      gaps.push({
        source: source.name,
        issue: `Data for ${source.monthsCovered} of 12 months (no data: ${missing.join(", ")}).`,
        effect: "Emissions for months without data are not included; no estimate applied.",
      });
    }
    if (dataTypes.get(source.key) === "Estimated") {
      gaps.push({
        source: source.name,
        issue: "Activity data is estimated.",
        effect: "Higher uncertainty than metered or invoiced data.",
      });
    }

    const values = source.monthlyActivity.filter((value): value is number => value !== null);
    if (values.length >= 2) {
      const mid = median(values);
      const outliers = source.monthlyActivity
        .map((value, index) => ({ value, month: MONTHS[index] }))
        .filter((item): item is { value: number; month: string } => item.value !== null)
        .filter((item) => mid > 0 && Math.abs(item.value - mid) / mid > 0.3)
        .map((item) => {
          const change = ((item.value - mid) / mid) * 100;
          return `${item.month} (${change > 0 ? "+" : ""}${Math.round(change)}%)`;
        });
      if (outliers.length > 0) {
        gaps.push({
          source: source.name,
          issue: `Months more than ±30% from the period median of ${formatActivity(mid)} ${source.unit}: ${outliers.join(", ")}.`,
          effect: "Outlier to verify against source records.",
        });
      }
    }
  }

  for (const row of boundary.filter((item) => item.status === "Excluded")) {
    gaps.push({
      source: row.scope_category,
      issue: `Excluded: ${row.justification}`,
      effect:
        row.basis.startsWith(NO_DATA_JUSTIFICATION)
          ? "Category not quantified; total emissions are understated by an unknown amount."
          : "Outside the inventory boundary.",
    });
  }

  return gaps;
}

// Builds the full Handlebars context for ghg_inventory_report.hbs. Every number is calculated
// here from `calculateInventory`; the template only displays the formatted strings.
//
// MANUAL fields come from `settings`, AI fields from `narrative`, everything else is AUTO.
export function buildReportContext(input: InventoryInput) {
  const { reportingYear, settings, masterlist } = input;
  const totals = calculateInventory(reportingYear, input.activities, input.factors);
  const inScope = totals.sources.filter((source) => !source.outsideScopes);
  const outside = totals.sources.filter((source) => source.outsideScopes);

  const scopeShares = roundedShares([totals.scope1, totals.scope2, totals.scope3], totals.total);
  const sourceShares = roundedShares(inScope.map((source) => source.tonnes), totals.total);
  const shareOf = new Map(inScope.map((source, index) => [source.key, sourceShares[index]]));

  const boundary = buildBoundary(masterlist, totals.sources, settings.boundary_notes);
  const dataTypes = new Map(
    totals.sources.map((source) => [source.key, masterlistEntryFor(masterlist, source)?.data_type || "Not specified"])
  );

  // Base-year comparison only when the base year is earlier and a full inventory exists for it.
  const baseYear = Number(settings.base_year);
  let comparisonRows: Array<{ scope: string; base: string; current: string; change_pct: string }> = [];
  if (baseYear && baseYear < reportingYear) {
    const base = calculateInventory(baseYear, input.activities, input.factors);
    const sameBoundary =
      inScope.length > 0 &&
      inScope.every((source) => base.sources.some((b) => b.key === source.key && b.monthsCovered === 12));
    if (sameBoundary) {
      const change = (current: number, previous: number) =>
        previous > 0 ? `${current >= previous ? "+" : ""}${formatPercent(((current - previous) / previous) * 100)}` : "–";
      comparisonRows = [
        ["Scope 1", base.scope1, totals.scope1],
        ["Scope 2", base.scope2, totals.scope2],
        ["Scope 3", base.scope3, totals.scope3],
        ["Total", base.total, totals.total],
      ].map(([scope, previous, current]) => ({
        scope: String(scope),
        base: formatTonnes(Number(previous)),
        current: formatTonnes(Number(current)),
        change_pct: change(Number(current), Number(previous)),
      }));
    }
  }

  const usedFactors = totals.sources.filter((source) => source.factor);
  const consolidation = consolidationLabel(settings.consolidation_approach);
  const narrative = input.narrative;

  return {
    // Cover, document control and sign-off (MANUAL)
    organisation_name: settings.organisation_name,
    campus_name: settings.campus_name,
    campus_address: settings.campus_address,
    contact_email: settings.contact_email,
    reporting_year: String(reportingYear),
    reporting_period_start: formatDate(new Date(reportingYear, 0, 1)),
    reporting_period_end: formatDate(new Date(reportingYear, 11, 31)),
    base_year: settings.base_year,
    base_year_rationale: settings.base_year_rationale,
    recalc_threshold_pct: settings.recalc_threshold_pct || "5",
    report_version: settings.report_version,
    report_date: settings.report_date,
    prepared_by: settings.prepared_by,
    prepared_by_org: settings.prepared_by_org,
    reviewed_by: settings.reviewed_by,
    approved_by: settings.approved_by,
    assurance_status: settings.assurance_status,
    assurance_statement: settings.assurance_statement,
    verifier: "",
    platform_name: settings.platform_name,

    // Profile (MANUAL, context only – never used in calculations)
    organisation_profile: settings.organisation_profile,
    gross_floor_area_m2: settings.gross_floor_area_m2 ? formatInteger(Number(settings.gross_floor_area_m2.replace(/,/g, ""))) : "",
    staff_count: settings.staff_count ? formatInteger(Number(settings.staff_count.replace(/,/g, ""))) : "",
    student_count: settings.student_count ? formatInteger(Number(settings.student_count.replace(/,/g, ""))) : "",

    // Boundaries
    consolidation_approach: consolidation,
    consolidation_approach_lower: consolidation.toLowerCase(),
    sites_included: settings.sites_included,
    sites_excluded_statement: settings.sites_excluded_statement,
    boundary_rows: boundary,

    // Results (AUTO)
    scope1_tco2e: formatTonnes(totals.scope1),
    scope2_tco2e: formatTonnes(totals.scope2),
    scope3_tco2e: formatTonnes(totals.scope3),
    total_tco2e: formatTonnes(totals.total),
    scope1_pct: formatPercent(scopeShares[0]),
    scope2_pct: formatPercent(scopeShares[1]),
    scope3_pct: formatPercent(scopeShares[2]),
    outside_scopes_tco2e: formatTonnes(totals.outsideScopes),
    top_sources: inScope
      .slice()
      .sort((a, b) => b.tonnes - a.tonnes)
      .slice(0, 5)
      .map((source) => ({
        source_name: source.name,
        scope: `Scope ${source.scope}`,
        tco2e: formatTonnes(source.tonnes),
        pct: formatPercent(shareOf.get(source.key) || 0),
      })),
    source_rows: inScope.map((source) => ({
      scope: `Scope ${source.scope}`,
      category: source.category.replace(/^Scope \d – /, ""),
      source: source.name,
      activity: formatActivity(source.activity),
      activity_unit: source.unit,
      tco2e: formatTonnes(source.tonnes),
      pct: formatPercent(shareOf.get(source.key) || 0),
    })),
    gas_rows: Array.from(new Set(inScope.map((source) => source.group))).map((group) => {
      const members = inScope.filter((source) => source.group === group);
      const sum = (pick: (source: SourceResult) => number) => members.reduce((total, s) => total + pick(s), 0);
      return {
        group,
        co2: formatGas(sum((s) => s.co2T)),
        ch4: formatGas(sum((s) => s.ch4T)),
        n2o: formatGas(sum((s) => s.n2oT)),
        hfc: formatGas(sum((s) => s.hfcT)),
        co2e_unsplit: formatGas(sum((s) => s.unsplitT)),
        total: formatTonnes(sum((s) => s.tonnes)),
      };
    }),
    gas_co2: formatTonnes(totals.gas.co2),
    gas_ch4: formatTonnes(totals.gas.ch4),
    gas_n2o: formatTonnes(totals.gas.n2o),
    gas_hfc: formatTonnes(totals.gas.hfc),
    gas_unsplit: formatTonnes(totals.gas.unsplit),
    outside_scope_rows: outside.map((source) => ({
      substance: source.name,
      kg: formatActivity(source.activity),
      gwp: formatFactor(source.effectiveFactor),
      tco2e: formatTonnes(source.tonnes),
    })),
    market_based: typeof input.scope2MarketKg === "number",
    scope2_market_tco2e: typeof input.scope2MarketKg === "number" ? formatTonnes(input.scope2MarketKg / 1000) : "",
    has_prior_year: comparisonRows.length > 0,
    comparison_rows: comparisonRows,

    // Methodology (AUTO, except assumptions)
    gwp_set: GWP_SET,
    gwp_ch4: String(GWP_CH4),
    gwp_n2o: String(GWP_N2O),
    factor_summary: usedFactors.map((source) => ({
      source: source.name,
      reference: source.factor?.source || "Not specified",
      year: source.factor?.year ? String(source.factor.year) : "–",
    })),
    factor_rows: usedFactors.map((source) => ({
      source: source.name,
      co2e: formatFactor(source.effectiveFactor),
      unit: `kg CO2e/${source.unit}`,
      co2: source.gasSplit ? formatFactor(source.factor?.co2) : "–",
      ch4: source.gasSplit ? formatFactor(source.factor?.ch4) : "–",
      n2o: source.gasSplit ? formatFactor(source.factor?.n2o) : "–",
      reference: source.factor?.source || "Not specified",
      year: source.factor?.year ? String(source.factor.year) : "–",
    })),
    data_sources: totals.sources.map((source) => {
      const entry = masterlistEntryFor(masterlist, source);
      return {
        source: source.name,
        owner: entry?.owner || "Not specified",
        evidence: entry?.evidence || "Not specified",
        data_type: dataTypes.get(source.key) || "Not specified",
        months_covered: String(source.monthsCovered),
      };
    }),
    assumptions: settings.assumptions,

    // Appendices (AUTO)
    activity_rows: totals.sources.map((source) => ({
      source: source.name,
      unit: source.unit,
      months: source.monthlyActivity.map((value) => (value === null ? "" : formatActivity(value))),
      total: formatActivity(source.activity),
    })),
    calc_rows: inScope.map((source) => ({
      source: source.name,
      activity: formatActivity(source.activity),
      activity_unit: source.unit,
      factor: formatFactor(source.effectiveFactor),
      factor_unit: `kg CO2e/${source.unit}`,
      kgco2e: formatActivity(source.kg),
      tco2e: formatTonnes(source.tonnes),
    })),

    // Data gaps (AUTO)
    data_gaps: buildDataGaps(totals.sources, boundary, dataTypes),

    // AI-drafted narrative (reviewed by the consultant)
    exec_summary_paragraph: narrative?.exec_summary_paragraph || "",
    exec_recommendations_paragraph: narrative?.exec_recommendations_paragraph || "",
    hotspot_analysis: narrative?.hotspot_analysis || "",
    improvement_plan: narrative?.improvement_plan || "",
    recommendations: narrative?.recommendations || [],

    // Raw results for charts and tests; not referenced by the template.
    _totals: totals,
  };
}

export type ReportContext = ReturnType<typeof buildReportContext>;
