import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import fixture from "./fixtures/utm-kl-2024.json";
import { mergeEmissionFactorsWithLocalDefinitions } from "@/lib/emission-factor-sync";
import { buildReportContext, NO_DATA_JUSTIFICATION } from "@/lib/report/build-context";
import { formatTonnes, roundedShares } from "@/lib/report/format";
import { parseMasterlist } from "@/lib/report/masterlist";
import { emptySettings, type ActivityRecord, type FactorRecord } from "@/lib/report/types";

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(fixture.masterlistRows), "Masterlist");
const masterlist = parseMasterlist(workbook);
const factors = mergeEmissionFactorsWithLocalDefinitions(fixture.dbFactors as never) as unknown as FactorRecord[];

const context = buildReportContext({
  reportingYear: 2024,
  activities: fixture.activities as ActivityRecord[],
  factors,
  masterlist,
  settings: { ...emptySettings(), organisation_name: "Universiti Teknologi Malaysia", base_year: "2024" },
});
const totals = context._totals;

describe("number formatting", () => {
  it("formats tonnes to 1 decimal with separators", () => {
    expect(formatTonnes(12332.24)).toBe("12,332.2");
    expect(formatTonnes(0.04)).toBe("<0.1");
    expect(formatTonnes(0)).toBe("0.0");
  });

  it("rounds shares so they sum to 100", () => {
    const shares = roundedShares([1, 1, 1]);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
  });
});

describe("UTM KL 2024 inventory", () => {
  it("matches the Section 5.1 scope totals", () => {
    expect(context.scope1_tco2e).toBe("2,579.2");
    expect(context.scope2_tco2e).toBe("8,357.3");
    expect(context.scope3_tco2e).toBe("1,395.7");
    expect(context.total_tco2e).toBe("12,332.2");
    expect(context.outside_scopes_tco2e).toBe("269.3");
    expect(totals.total).toBeCloseTo(totals.scope1 + totals.scope2 + totals.scope3, 9);
  });

  it("keeps R22 outside the scope totals", () => {
    expect(context.outside_scope_rows.map((row) => row.substance)).toEqual(["Refrigerant R22"]);
    expect(context.source_rows.some((row) => row.source.includes("R22"))).toBe(false);
  });

  it("matches the Section 5.3 gas totals", () => {
    expect(context.gas_co2).toBe("1.1");
    expect(context.gas_ch4).toBe("<0.1");
    expect(context.gas_n2o).toBe("<0.1");
    expect(context.gas_hfc).toBe("2,578.2");
    expect(context.gas_unsplit).toBe("9,753.0");
    const { co2, ch4, n2o, hfc, unsplit } = totals.gas;
    expect(co2 + ch4 + n2o + hfc + unsplit).toBeCloseTo(totals.total, 9);
  });

  it("Appendix C rows sum to the Section 5.1 total", () => {
    const inScope = totals.sources.filter((source) => !source.outsideScopes);
    expect(context.calc_rows).toHaveLength(inScope.length);
    expect(inScope.reduce((sum, source) => sum + source.activity * source.effectiveFactor, 0) / 1000).toBeCloseTo(totals.total, 9);
  });

  it("scope and source shares sum to 100%", () => {
    const sum = (values: string[]) => values.reduce((total, value) => total + Number(value), 0);
    expect(sum([context.scope1_pct, context.scope2_pct, context.scope3_pct])).toBeCloseTo(100, 6);
    expect(sum(context.source_rows.map((row) => row.pct))).toBeCloseTo(100, 6);
  });

  it("lists categories with no 2024 data as Excluded", () => {
    for (const label of ["Mobile combustion", "Business travel", "Employee commuting"]) {
      const row = context.boundary_rows.find((item) => item.scope_category.includes(label));
      expect(row?.status).toBe("Excluded");
      expect(row?.justification.startsWith(NO_DATA_JUSTIFICATION)).toBe(true);
    }
    expect(context.boundary_rows.find((row) => row.scope_category.includes("Purchased electricity"))?.status).toBe("Included");
  });

  it("records the reason for each boundary category in the justification", () => {
    const withNote = buildReportContext({
      reportingYear: 2024,
      activities: fixture.activities as ActivityRecord[],
      factors,
      masterlist,
      settings: {
        ...emptySettings(),
        boundary_notes: { "Scope 3 – Cat. 7 Employee commuting": "Commuting survey not yet run by Pendaftar." },
      },
    });
    const row = withNote.boundary_rows.find((item) => item.scope_category === "Scope 3 – Cat. 7 Employee commuting");
    expect(row?.reason).toBe("Commuting survey not yet run by Pendaftar.");
    expect(row?.justification).toContain("Data owner: Pendaftar - BPKL.");
    expect(row?.justification).toContain("Reason: Commuting survey not yet run by Pendaftar.");
    const diesel = withNote.boundary_rows.find((item) => item.scope_category.includes("Stationary"));
    expect(diesel?.justification).toContain("no data: Jan, Mar, Apr, Jun, Jul, Sep, Oct, Dec");
  });

  it("leaves months without data blank in Appendix A", () => {
    const diesel = context.activity_rows.find((row) => row.source.startsWith("Diesel"));
    expect(diesel?.months).toHaveLength(12);
    expect(diesel?.months.filter((value) => value === "")).toHaveLength(8);
    expect(diesel?.months).not.toContain("0");
  });

  it("flags gaps for partial sources and excluded categories", () => {
    expect(context.data_gaps.some((gap) => gap.source.startsWith("Diesel") && gap.issue.includes("4 of 12"))).toBe(true);
    expect(context.data_gaps.some((gap) => gap.source.includes("Employee commuting"))).toBe(true);
  });

  it("only lists factors used in the inventory", () => {
    expect(context.factor_rows.map((row) => row.source)).not.toContain("Petrol – vehicles");
    expect(context.factor_rows).toHaveLength(totals.sources.length);
  });

  it("has no base-year comparison when the base year is the reporting year", () => {
    expect(context.has_prior_year).toBe(false);
  });

  it("never compares against a base year later than the reporting year", () => {
    const later = buildReportContext({
      reportingYear: 2024,
      activities: fixture.activities as ActivityRecord[],
      factors,
      masterlist,
      settings: { ...emptySettings(), base_year: "2025" },
    });
    expect(later.has_prior_year).toBe(false);
  });

  it("builds a base-year comparison from an earlier year with the same sources", () => {
    const shifted = (fixture.activities as ActivityRecord[]).map((row) => ({ ...row, date: row.date.replace("2024", "2023") }));
    // Fill every month of the base year so each 2024 source has a complete base-year record.
    const fullBase = Array.from(new Set(shifted.map((row) => row.activity_type))).flatMap((type) => {
      const sample = shifted.find((row) => row.activity_type === type)!;
      return Array.from({ length: 12 }, (_, month) => ({ ...sample, date: `2023-${String(month + 1).padStart(2, "0")}-01` }));
    });
    const compared = buildReportContext({
      reportingYear: 2024,
      activities: [...(fixture.activities as ActivityRecord[]), ...fullBase],
      factors,
      masterlist,
      settings: { ...emptySettings(), base_year: "2023" },
    });
    expect(compared.has_prior_year).toBe(true);
    expect(compared.comparison_rows.map((row) => row.scope)).toEqual(["Scope 1", "Scope 2", "Scope 3", "Total"]);
    expect(compared.comparison_rows[3].current).toBe("12,332.2");
  });
});
