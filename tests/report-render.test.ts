import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import fixture from "./fixtures/utm-kl-2024.json";
import { mergeEmissionFactorsWithLocalDefinitions } from "@/lib/emission-factor-sync";
import { buildReportContext } from "@/lib/report/build-context";
import { parseMasterlist } from "@/lib/report/masterlist";
import { unsupportedNumbers } from "@/lib/report/narrative";
import { finalExportBlockers, renderReportHtml, reportFileName } from "@/lib/report/render";
import { emptyNarrative, emptySettings, type ActivityRecord, type FactorRecord } from "@/lib/report/types";

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(fixture.masterlistRows), "Masterlist");

export const sampleSettings = {
  ...emptySettings(),
  organisation_name: "Universiti Teknologi Malaysia",
  campus_name: "UTM Kuala Lumpur",
  campus_address: "Jalan Sultan Yahya Petra, 54100 Kuala Lumpur",
  contact_email: "sustainability@utm.my",
  base_year: "2024",
  base_year_rationale: "2024 is the first year with complete metered electricity and water data.",
  report_date: "2 November 2026",
  prepared_by: "Consultant name, GHG Analyst",
  prepared_by_org: "Aethera",
  reviewed_by: "Reviewer name",
  approved_by: "Approver name",
  assurance_statement: "This inventory has been internally reviewed and has not been externally verified.",
  organisation_profile: "UTM Kuala Lumpur is the city campus of Universiti Teknologi Malaysia.",
  gross_floor_area_m2: "250000",
  staff_count: "1200",
  student_count: "8000",
  consolidation_approach: "operational",
  sites_included: "UTM Kuala Lumpur campus",
  sites_excluded_statement: "No sites under operational control are excluded.",
  assumptions: "Months without submitted data are not estimated.",
};

const context = buildReportContext({
  reportingYear: 2024,
  activities: fixture.activities as ActivityRecord[],
  factors: mergeEmissionFactorsWithLocalDefinitions(fixture.dbFactors as never) as unknown as FactorRecord[],
  masterlist: parseMasterlist(workbook),
  settings: sampleSettings,
});

describe("report rendering", () => {
  const draft = renderReportHtml(context, { mode: "draft" });
  const final = renderReportHtml(context, { mode: "final" });

  it("leaves no placeholders or banned labels in final mode", () => {
    expect(final).not.toMatch(/\{\{|\}\}/);
    expect(final.toLowerCase()).not.toContain("metric tons");
    expect(final.toLowerCase()).not.toContain("intensity");
    expect(final.toLowerCase()).not.toContain("forecast signal");
    expect(final).toMatch(/^<body class="final">/m);
  });

  it("keeps guide tags visible in draft mode", () => {
    expect(draft).toMatch(/^<body>/m);
    expect(draft).toContain('class="guide g-auto"');
  });

  it("embeds every image as a data URI", () => {
    expect(final).not.toMatch(/(src="|url\(')assets\//);
    expect(final).toContain("data:image/jpeg;base64,");
    expect(final).toContain("data:image/png;base64,");
  });

  it("draws both charts as inline SVG with no scripts", () => {
    expect(final.match(/<svg /g)?.length).toBe(2);
    expect(final).not.toContain("<script");
  });

  it("shows the Section 5.1 figures", () => {
    for (const figure of ["2,579.2", "8,357.3", "1,395.7", "12,332.2", "269.3"]) expect(final).toContain(figure);
  });
});

describe("final export rules", () => {
  it("blocks final export until AI fields are drafted and approved", () => {
    const narrative = emptyNarrative();
    expect(finalExportBlockers(sampleSettings, narrative)).toContain('AI field "hotspot analysis" is empty');
    narrative.fields.hotspot_analysis = "Text";
    expect(finalExportBlockers(sampleSettings, narrative)).toContain('AI field "hotspot analysis" is not approved');
  });

  it("requires a recorded reason for every Excluded category", () => {
    const boundary = [{ scope_category: "Scope 3 – Cat. 6 Business travel", status: "Excluded", reason: "" }];
    expect(finalExportBlockers(sampleSettings, emptyNarrative(), boundary)).toContain(
      'Reason for excluding "Scope 3 – Cat. 6 Business travel"'
    );
    boundary[0].reason = "Travel records held by finance; requested for next inventory.";
    expect(finalExportBlockers(sampleSettings, emptyNarrative(), boundary).some((item) => item.startsWith("Reason"))).toBe(false);
  });

  it("lists empty MANUAL fields", () => {
    expect(finalExportBlockers({ ...sampleSettings, reviewed_by: "" }, emptyNarrative())).toContain("Reviewed by");
  });

  it("names the PDF after organisation, year and version", () => {
    expect(reportFileName(sampleSettings, 2024)).toBe("GHG_Inventory_Universiti_Teknologi_Malaysia_2024_1.0.pdf");
  });
});

describe("AI number validation", () => {
  const data = { total: "12,332.2", share: "67.8" };
  it("accepts numbers from the data and flags invented ones", () => {
    expect(unsupportedNumbers("Total 12,332.2 tCO2e, electricity 67.8% of Scope 2.", data)).toEqual([]);
    expect(unsupportedNumbers("Saving 1,200 tCO2e worth RM 50,000.", data)).toEqual(["1,200", "50,000"]);
  });
});
