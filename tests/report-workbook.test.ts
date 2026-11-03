import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/utm-kl-2024.json";
import { mergeEmissionFactorsWithLocalDefinitions } from "@/lib/emission-factor-sync";
import { buildCalculationWorkbook, calculationWorkbookFileName } from "@/lib/report/workbook";
import type { ActivityRecord, FactorRecord } from "@/lib/report/types";

const factors = mergeEmissionFactorsWithLocalDefinitions(fixture.dbFactors as never) as unknown as FactorRecord[];
const activities = fixture.activities as ActivityRecord[];

async function load() {
  const { buffer, years } = await buildCalculationWorkbook({ organisationName: "Universiti Teknologi Malaysia", activities, factors });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  return { workbook, years };
}

// The exceljs reader drops cached results of 0 and "" (they are written to the file), so a
// missing result is read as 0.
const resultOf = (cell: ExcelJS.Cell) => {
  const value = cell.value as ExcelJS.CellFormulaValue | number | null;
  return typeof value === "object" && value !== null ? value.result ?? 0 : value;
};

describe("calculation workbook", () => {
  it("has the check sheets in order", async () => {
    const { workbook, years } = await load();
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Summary",
      "Emissions by Source",
      "CO2e (Monthly)",
      "Activity Data (Monthly)",
      "Emission Factors",
    ]);
    expect(years).toEqual([2024]);
  });

  it("summary formulas link to the source sheet and match the UTM KL 2024 totals", async () => {
    const { workbook } = await load();
    const row = workbook.getWorksheet("Summary")!.getRow(7);
    expect(row.getCell(1).value).toBe(2024);
    expect((row.getCell(5).value as ExcelJS.CellFormulaValue).formula).toMatch(/^'Emissions by Source'!F\d+$/);
    expect(Number(resultOf(row.getCell(2))).toFixed(1)).toBe("2579.2");
    expect(Number(resultOf(row.getCell(3))).toFixed(1)).toBe("8357.3");
    expect(Number(resultOf(row.getCell(4))).toFixed(1)).toBe("1395.7");
    expect(Number(resultOf(row.getCell(5))).toFixed(1)).toBe("12332.2");
    expect(Number(resultOf(row.getCell(6))).toFixed(1)).toBe("269.3");
    expect(resultOf(row.getCell(8))).toBe(0);
  });

  it("monthly CO2e cells are activity x the factor used", async () => {
    const { workbook } = await load();
    const co2e = workbook.getWorksheet("CO2e (Monthly)")!;
    const formulas: string[] = [];
    co2e.getRow(7).eachCell((cell, c) => {
      if (c >= 3 && typeof cell.value === "object" && cell.value && "formula" in cell.value) formulas.push(String(cell.value.formula));
    });
    expect(formulas[0] ?? "").toMatch(/^IF\('Activity Data \(Monthly\)'!C7="","",'Activity Data \(Monthly\)'!C7\*'Emission Factors'!\$K\$8\)$/);
  });

  it("every formula cell carries a numeric or blank result", async () => {
    const { workbook } = await load();
    let count = 0;
    workbook.eachSheet((sheet) =>
      sheet.eachRow((row) =>
        row.eachCell((cell) => {
          const value = cell.value;
          if (typeof value === "object" && value && "formula" in value) {
            count++;
            const result = value.result ?? 0;
            expect(typeof result === "number" ? Number.isFinite(result) : result === "").toBe(true);
          }
        })
      )
    );
    expect(count).toBeGreaterThan(100);
  });

  it("names the file after the organisation and years", () => {
    expect(calculationWorkbookFileName("Universiti Teknologi Malaysia", [2017, 2026])).toBe(
      "GHG_Calculation_Workbook_Universiti_Teknologi_Malaysia_2017-2026.xlsx"
    );
  });
});
