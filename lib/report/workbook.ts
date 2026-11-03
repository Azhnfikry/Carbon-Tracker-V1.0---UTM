import ExcelJS from "exceljs";
import { GWP_CH4, GWP_N2O, GWP_SET } from "@/lib/emission-calculations";
import { calculateInventory, MONTHS, type InventoryTotals, type SourceResult } from "@/lib/report/build-context";
import type { ActivityRecord, FactorRecord } from "@/lib/report/types";

// Calculation workbook for rechecking the inventory. Every result is an Excel formula of
// activity x emission factor, linked across sheets; cached results are stored so the values
// show even before Excel recalculates (e.g. in Protected View).

const SHEETS = {
  summary: "Summary",
  bySource: "Emissions by Source",
  co2e: "CO2e (Monthly)",
  activity: "Activity Data (Monthly)",
  factors: "Emission Factors",
};

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };
const TOTAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F4F4" } };
const NOTE_FONT: Partial<ExcelJS.Font> = { italic: true, color: { argb: "FF666666" }, size: 9 };
const FMT_ACTIVITY = "#,##0.00";
const FMT_KG = "#,##0.00";
const FMT_TONNES = "#,##0.000";
const FMT_FACTOR = "0.000000";

// Cells in the Emission Factors sheet that hold the GWPs.
const GWP_CH4_CELL = `'${SHEETS.factors}'!$B$4`;
const GWP_N2O_CELL = `'${SHEETS.factors}'!$B$5`;
const FACTOR_FIRST_ROW = 8;
const MONTHLY_FIRST_ROW = 7;
const BLOCK = 13; // 12 months + a yearly total row

const col = (index: number) => {
  let name = "";
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};
const ref = (sheet: string, cell: string) => `'${sheet}'!${cell}`;

interface WorkbookSource {
  key: string;
  scope: number;
  name: string;
  activityType: string;
  unit: string;
  factor: FactorRecord | null;
  effectiveFactor: number;
  gasSplit: boolean;
  outsideScopes: boolean;
  byYear: Map<number, SourceResult>;
}

export interface CalculationWorkbookInput {
  organisationName: string;
  activities: ActivityRecord[];
  factors: FactorRecord[];
}

function collectSources(years: number[], inventories: Map<number, InventoryTotals>) {
  const sources = new Map<string, WorkbookSource>();
  for (const year of years) {
    for (const result of inventories.get(year)!.sources) {
      let source = sources.get(result.key);
      if (!source) {
        source = {
          key: result.key,
          scope: result.scope,
          name: result.name,
          activityType: result.activityType,
          unit: result.unit,
          factor: result.factor,
          effectiveFactor: result.effectiveFactor,
          gasSplit: result.gasSplit,
          outsideScopes: result.outsideScopes,
          byYear: new Map(),
        };
        sources.set(result.key, source);
      }
      source.byYear.set(year, result);
    }
  }
  return Array.from(sources.values()).sort(
    (a, b) => a.scope - b.scope || Number(a.outsideScopes) - Number(b.outsideScopes) || a.name.localeCompare(b.name)
  );
}

const scopeLabel = (source: WorkbookSource) =>
  source.outsideScopes ? `Scope ${source.scope} (memo – outside scopes)` : `Scope ${source.scope}`;

function styleHeaderRow(row: ExcelJS.Row, from: number, to: number) {
  for (let c = from; c <= to; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.alignment = { wrapText: true, vertical: "middle" };
  }
}

function title(sheet: ExcelJS.Worksheet, text: string, notes: string[]) {
  sheet.getCell("A1").value = text;
  sheet.getCell("A1").font = { bold: true, size: 14 };
  notes.forEach((note, index) => {
    const cell = sheet.getCell(2 + index, 1);
    cell.value = note;
    cell.font = NOTE_FONT;
  });
}

export async function buildCalculationWorkbook(input: CalculationWorkbookInput): Promise<{ buffer: Buffer; years: number[] }> {
  const years = Array.from(
    new Set(input.activities.map((activity) => Number(String(activity.date).slice(0, 4))).filter((year) => year > 1900))
  ).sort((a, b) => a - b);
  const inventories = new Map(years.map((year) => [year, calculateInventory(year, input.activities, input.factors)]));
  const sources = collectSources(years, inventories);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Aethera Carbon Tracker";
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const summary = workbook.addWorksheet(SHEETS.summary);
  const bySource = workbook.addWorksheet(SHEETS.bySource);
  const co2e = workbook.addWorksheet(SHEETS.co2e);
  const activity = workbook.addWorksheet(SHEETS.activity);
  const factors = workbook.addWorksheet(SHEETS.factors);

  // ── Emission Factors ──────────────────────────────────────────────────────────────
  title(factors, "Emission factors used", [
    `Factor used = CO2e factor, or for factors given per gas: CO2 + CH4 × GWP(CH4) + N2O × GWP(N2O). GWPs: ${GWP_SET}. Change a factor or GWP here and every sheet updates.`,
  ]);
  factors.getCell("A4").value = "GWP CH4";
  factors.getCell("B4").value = GWP_CH4;
  factors.getCell("A5").value = "GWP N2O";
  factors.getCell("B5").value = GWP_N2O;
  for (const address of ["A4", "A5"]) factors.getCell(address).font = { bold: true };

  const factorHeaders = [
    "Scope",
    "Source",
    "Activity type (as stored)",
    "Activity unit",
    "Reported",
    "Method",
    "CO2e factor\n(kg CO2e / unit)",
    "CO2\n(kg / unit)",
    "CH4\n(kg / unit)",
    "N2O\n(kg / unit)",
    "Factor used\n(kg CO2e / unit)",
    "Reference",
    "Year",
  ];
  const factorHeaderRow = factors.getRow(FACTOR_FIRST_ROW - 1);
  factorHeaders.forEach((header, index) => (factorHeaderRow.getCell(index + 1).value = header));
  styleHeaderRow(factorHeaderRow, 1, factorHeaders.length);

  const factorRow = (index: number) => FACTOR_FIRST_ROW + index;
  sources.forEach((source, index) => {
    const row = factors.getRow(factorRow(index));
    const r = factorRow(index);
    const factor = source.factor;
    row.values = [
      `Scope ${source.scope}`,
      source.name,
      source.activityType,
      source.unit,
      source.outsideScopes ? "Outside scopes (memo)" : "In scope total",
      !factor ? "No factor matched – CO2e is 0" : source.gasSplit ? "Per gas, AR5 GWP" : "Combined CO2e factor",
      typeof factor?.factor === "number" ? factor.factor : null,
      source.gasSplit ? factor?.co2 ?? 0 : null,
      source.gasSplit ? factor?.ch4 ?? 0 : null,
      source.gasSplit ? factor?.n2o ?? 0 : null,
      {
        formula: source.gasSplit ? `H${r}+I${r}*$B$4+J${r}*$B$5` : `N(G${r})`,
        result: source.effectiveFactor,
      },
      factor?.source || "",
      factor?.year ?? null,
    ];
    for (const c of [7, 8, 9, 10, 11]) row.getCell(c).numFmt = FMT_FACTOR;
    row.getCell(11).font = { bold: true };
  });
  [10, 34, 34, 12, 20, 26, 16, 12, 12, 12, 16, 36, 8].forEach((width, index) => (factors.getColumn(index + 1).width = width));
  factors.views = [{ state: "frozen", ySplit: FACTOR_FIRST_ROW - 1 }];

  // ── Monthly sheets (activity and CO2e share one layout) ──────────────────────────
  const sourceCol = (index: number) => 3 + index;
  const monthRow = (yearIndex: number, month: number) => MONTHLY_FIRST_ROW + yearIndex * BLOCK + month;
  const totalRow = (yearIndex: number) => MONTHLY_FIRST_ROW + yearIndex * BLOCK + 12;

  const monthlyLayout = (sheet: ExcelJS.Worksheet, unitFor: (source: WorkbookSource) => string, extraHeaders: string[]) => {
    const names = sheet.getRow(4);
    const scopes = sheet.getRow(5);
    const units = sheet.getRow(6);
    names.getCell(1).value = "Year";
    names.getCell(2).value = "Month";
    scopes.getCell(1).value = "Scope";
    units.getCell(1).value = "Unit";
    sources.forEach((source, index) => {
      names.getCell(sourceCol(index)).value = source.name;
      scopes.getCell(sourceCol(index)).value = scopeLabel(source);
      units.getCell(sourceCol(index)).value = unitFor(source);
    });
    extraHeaders.forEach((header, index) => (names.getCell(sourceCol(sources.length) + index).value = header));
    const lastCol = sourceCol(sources.length) + extraHeaders.length - 1;
    for (const row of [names, scopes, units]) styleHeaderRow(row, 1, lastCol);
    names.height = 45;

    years.forEach((year, yearIndex) => {
      MONTHS.forEach((month, m) => {
        const row = sheet.getRow(monthRow(yearIndex, m));
        row.getCell(1).value = year;
        row.getCell(2).value = month;
      });
      const total = sheet.getRow(totalRow(yearIndex));
      total.getCell(1).value = year;
      total.getCell(2).value = `Total ${year}`;
      for (let c = 1; c <= lastCol; c++) {
        total.getCell(c).font = { bold: true };
        total.getCell(c).fill = TOTAL_FILL;
      }
    });
    sheet.getColumn(1).width = 8;
    sheet.getColumn(2).width = 11;
    for (let c = 3; c <= lastCol; c++) sheet.getColumn(c).width = 18;
    sheet.views = [{ state: "frozen", xSplit: 2, ySplit: 6 }];
    return lastCol;
  };

  // Activity data: the stored quantities, in the emission factor's unit.
  title(activity, "Monthly activity data by source", [
    "Quantities as stored in the platform, in the emission factor's unit (waste entered in tonnes is stored in kg). Blank = no data for that month. Yearly totals sum the 12 months.",
  ]);
  monthlyLayout(activity, (source) => source.unit, []);
  years.forEach((year, yearIndex) => {
    sources.forEach((source, index) => {
      const c = sourceCol(index);
      const result = source.byYear.get(year);
      MONTHS.forEach((_, m) => {
        const value = result?.monthlyActivity[m];
        const cell = activity.getCell(monthRow(yearIndex, m), c);
        if (value !== null && value !== undefined) cell.value = value;
        cell.numFmt = FMT_ACTIVITY;
      });
      const total = activity.getCell(totalRow(yearIndex), c);
      total.value = {
        formula: `SUM(${col(c)}${monthRow(yearIndex, 0)}:${col(c)}${monthRow(yearIndex, 11)})`,
        result: result?.activity ?? 0,
      };
      total.numFmt = FMT_ACTIVITY;
    });
  });

  // CO2e: each month = activity x factor used, in kg CO2e, plus scope totals.
  title(co2e, "Monthly emissions (kg CO2e) by source", [
    `Each cell = Activity Data (Monthly) × "Factor used" in Emission Factors. Scope totals add in-scope sources only; HCFC refrigerants (e.g. R22) are a memo outside the scopes.`,
  ]);
  const scopeHeaders = ["Scope 1 total", "Scope 2 total", "Scope 3 total", "Total (Scopes 1–3)"];
  monthlyLayout(co2e, () => "kg CO2e", scopeHeaders);
  const scopeTotalCol = (scope: number) => sourceCol(sources.length) + scope - 1;
  const grandTotalCol = sourceCol(sources.length) + 3;
  for (const c of [scopeTotalCol(1), scopeTotalCol(2), scopeTotalCol(3), grandTotalCol]) {
    co2e.getCell(5, c).value = "In scope";
    co2e.getCell(6, c).value = "kg CO2e";
  }

  years.forEach((year, yearIndex) => {
    const rows = [...MONTHS.map((_, m) => monthRow(yearIndex, m)), totalRow(yearIndex)];
    rows.forEach((r, position) => {
      const isTotal = position === 12;
      const scopeSums = [0, 0, 0];
      sources.forEach((source, index) => {
        const c = sourceCol(index);
        const result = source.byYear.get(year);
        const cell = co2e.getCell(r, c);
        if (isTotal) {
          const value = result?.kg ?? 0;
          cell.value = { formula: `SUM(${col(c)}${rows[0]}:${col(c)}${rows[11]})`, result: value };
          if (!source.outsideScopes) scopeSums[source.scope - 1] += value;
        } else {
          const quantity = result?.monthlyActivity[position];
          const activityCell = ref(SHEETS.activity, `${col(c)}${r}`);
          const factorCell = ref(SHEETS.factors, `$K$${factorRow(index)}`);
          const value = quantity === null || quantity === undefined ? "" : quantity * source.effectiveFactor;
          cell.value = { formula: `IF(${activityCell}="","",${activityCell}*${factorCell})`, result: value };
          if (typeof value === "number" && !source.outsideScopes) scopeSums[source.scope - 1] += value;
        }
        cell.numFmt = FMT_KG;
      });
      [1, 2, 3].forEach((scope) => {
        const cells = sources
          .map((source, index) => ({ source, index }))
          .filter(({ source }) => source.scope === scope && !source.outsideScopes)
          .map(({ index }) => `${col(sourceCol(index))}${r}`);
        const cell = co2e.getCell(r, scopeTotalCol(scope));
        cell.value = cells.length ? { formula: `SUM(${cells.join(",")})`, result: scopeSums[scope - 1] } : 0;
        cell.numFmt = FMT_KG;
      });
      const grand = co2e.getCell(r, grandTotalCol);
      grand.value = {
        formula: `SUM(${col(scopeTotalCol(1))}${r}:${col(scopeTotalCol(3))}${r})`,
        result: scopeSums[0] + scopeSums[1] + scopeSums[2],
      };
      grand.numFmt = FMT_KG;
      grand.font = { bold: true };
    });
  });

  // ── Emissions by Source (tCO2e per year and gas) ─────────────────────────────────
  title(bySource, "Emissions by source, year and gas (tCO2e)", [
    "Activity = yearly total in Activity Data (Monthly). CO2e = yearly total in CO2e (Monthly) ÷ 1000. Gas columns only for factors given per gas (CH4 and N2O as CO2e using the GWPs); combined factors (electricity, water, waste, refrigerants) have no gas split.",
  ]);
  const yearCol = (yearIndex: number) => 5 + yearIndex * 5;
  const BY_SOURCE_FIRST = 6;
  const groupRow = bySource.getRow(4);
  const headRow = bySource.getRow(5);
  ["Scope", "Source", "Unit", "In total?"].forEach((header, index) => (headRow.getCell(index + 1).value = header));
  years.forEach((year, yearIndex) => {
    const c = yearCol(yearIndex);
    groupRow.getCell(c).value = year;
    bySource.mergeCells(4, c, 4, c + 4);
    groupRow.getCell(c).alignment = { horizontal: "center" };
    ["Activity", "CO2e (t)", "CO2 (t)", "CH4 (tCO2e)", "N2O (tCO2e)"].forEach((header, offset) => (headRow.getCell(c + offset).value = header));
  });
  const lastBySourceCol = yearCol(years.length - 1) + 4;
  styleHeaderRow(groupRow, 1, lastBySourceCol);
  styleHeaderRow(headRow, 1, lastBySourceCol);

  const lastSourceRow = BY_SOURCE_FIRST + sources.length - 1;
  sources.forEach((source, index) => {
    const r = BY_SOURCE_FIRST + index;
    const row = bySource.getRow(r);
    row.getCell(1).value = `Scope ${source.scope}`;
    row.getCell(2).value = source.name;
    row.getCell(3).value = source.unit;
    row.getCell(4).value = source.outsideScopes ? "No – memo" : "Yes";
    years.forEach((year, yearIndex) => {
      const c = yearCol(yearIndex);
      const result = source.byYear.get(year);
      const activityTotal = ref(SHEETS.activity, `${col(sourceCol(index))}${totalRow(yearIndex)}`);
      const co2eTotal = ref(SHEETS.co2e, `${col(sourceCol(index))}${totalRow(yearIndex)}`);
      const f = FACTOR_FIRST_ROW + index;
      const activityCell = `${col(c)}${r}`;
      row.getCell(c).value = { formula: activityTotal, result: result?.activity ?? 0 };
      row.getCell(c).numFmt = FMT_ACTIVITY;
      row.getCell(c + 1).value = { formula: `${co2eTotal}/1000`, result: result?.tonnes ?? 0 };
      if (source.gasSplit) {
        const qty = result?.activity ?? 0;
        const factor = source.factor!;
        row.getCell(c + 2).value = { formula: `${activityCell}*${ref(SHEETS.factors, `$H$${f}`)}/1000`, result: (qty * (factor.co2 || 0)) / 1000 };
        row.getCell(c + 3).value = {
          formula: `${activityCell}*${ref(SHEETS.factors, `$I$${f}`)}*${GWP_CH4_CELL}/1000`,
          result: (qty * (factor.ch4 || 0) * GWP_CH4) / 1000,
        };
        row.getCell(c + 4).value = {
          formula: `${activityCell}*${ref(SHEETS.factors, `$J$${f}`)}*${GWP_N2O_CELL}/1000`,
          result: (qty * (factor.n2o || 0) * GWP_N2O) / 1000,
        };
      }
      for (let offset = 1; offset <= 4; offset++) row.getCell(c + offset).numFmt = FMT_TONNES;
    });
  });

  // Subtotals use SUMIFS on the Scope and "In total?" columns.
  const subtotalFirst = lastSourceRow + 2;
  const subtotalRows = {
    scope1: subtotalFirst,
    scope2: subtotalFirst + 1,
    scope3: subtotalFirst + 2,
    total: subtotalFirst + 3,
    memo: subtotalFirst + 4,
  };
  const subtotalLabels: Array<[number, string]> = [
    [subtotalRows.scope1, "Scope 1 total"],
    [subtotalRows.scope2, "Scope 2 total"],
    [subtotalRows.scope3, "Scope 3 total"],
    [subtotalRows.total, "Total (Scopes 1–3)"],
    [subtotalRows.memo, "Outside scopes (memo, not in total)"],
  ];
  for (const [r, label] of subtotalLabels) {
    const row = bySource.getRow(r);
    row.getCell(2).value = label;
    for (let c = 1; c <= lastBySourceCol; c++) {
      row.getCell(c).font = { bold: true };
      row.getCell(c).fill = TOTAL_FILL;
    }
  }
  const range = (letter: string) => `${letter}$${BY_SOURCE_FIRST}:${letter}$${lastSourceRow}`;
  years.forEach((year, yearIndex) => {
    const inventory = inventories.get(year)!;
    const memoBySource = sources.filter((s) => s.outsideScopes);
    const values = {
      co2e: [inventory.scope1, inventory.scope2, inventory.scope3],
      memo: memoBySource.reduce((sum, s) => sum + (s.byYear.get(year)?.tonnes ?? 0), 0),
    };
    for (let offset = 1; offset <= 4; offset++) {
      const c = yearCol(yearIndex) + offset;
      const letter = col(c);
      const scopeResult = (scope: number) => {
        const list = sources.filter((s) => s.scope === scope && !s.outsideScopes).map((s) => s.byYear.get(year));
        const pick = (r: SourceResult | undefined) =>
          !r ? 0 : offset === 1 ? r.tonnes : offset === 2 ? r.co2T : offset === 3 ? r.ch4T : r.n2oT;
        return offset === 1 ? values.co2e[scope - 1] : list.reduce((sum, r) => sum + pick(r), 0);
      };
      [1, 2, 3].forEach((scope) => {
        const cell = bySource.getCell(subtotalRows[`scope${scope}` as "scope1"], c);
        cell.value = {
          formula: `SUMIFS(${range(letter)},$A$${BY_SOURCE_FIRST}:$A$${lastSourceRow},"Scope ${scope}",$D$${BY_SOURCE_FIRST}:$D$${lastSourceRow},"Yes")`,
          result: scopeResult(scope),
        };
        cell.numFmt = FMT_TONNES;
      });
      const total = bySource.getCell(subtotalRows.total, c);
      total.value = {
        formula: `SUM(${letter}${subtotalRows.scope1}:${letter}${subtotalRows.scope3})`,
        result: scopeResult(1) + scopeResult(2) + scopeResult(3),
      };
      total.numFmt = FMT_TONNES;
      if (offset === 1) {
        const memo = bySource.getCell(subtotalRows.memo, c);
        memo.value = {
          formula: `SUMIFS(${range(letter)},$D$${BY_SOURCE_FIRST}:$D$${lastSourceRow},"No – memo")`,
          result: values.memo,
        };
        memo.numFmt = FMT_TONNES;
      }
    }
  });
  [10, 34, 10, 11].forEach((width, index) => (bySource.getColumn(index + 1).width = width));
  for (let c = 5; c <= lastBySourceCol; c++) bySource.getColumn(c).width = 13;
  bySource.views = [{ state: "frozen", xSplit: 2, ySplit: 5 }];

  // ── Summary ───────────────────────────────────────────────────────────────────────
  title(summary, `GHG calculation check – ${input.organisationName || "Organisation"}`, [
    `Generated ${new Date().toISOString().slice(0, 10)} by Aethera Carbon Tracker. All values in tCO2e and linked by formula: Activity Data × Emission Factors → CO2e (Monthly) → Emissions by Source → this sheet.`,
    `Factors given per gas use ${GWP_SET} GWPs (CH4 ${GWP_CH4}, N2O ${GWP_N2O}). HCFC refrigerants (e.g. R22) are reported outside the scopes and not in the total.`,
    `"Platform total" is the value calculated by the platform for the report; "Difference" should be 0. Edit any activity value or factor to test its effect.`,
  ]);
  const summaryHeaders = [
    "Year",
    "Scope 1",
    "Scope 2",
    "Scope 3",
    "Total (Scopes 1–3)",
    "Outside scopes (memo)",
    "Platform total",
    "Difference",
  ];
  const SUMMARY_HEAD = 6;
  const summaryHead = summary.getRow(SUMMARY_HEAD);
  summaryHeaders.forEach((header, index) => (summaryHead.getCell(index + 1).value = header));
  styleHeaderRow(summaryHead, 1, summaryHeaders.length);
  years.forEach((year, yearIndex) => {
    const inventory = inventories.get(year)!;
    const r = SUMMARY_HEAD + 1 + yearIndex;
    const row = summary.getRow(r);
    const co2eLetter = col(yearCol(yearIndex) + 1);
    const link = (subtotalRow: number) => ref(SHEETS.bySource, `${co2eLetter}${subtotalRow}`);
    row.getCell(1).value = year;
    row.getCell(2).value = { formula: link(subtotalRows.scope1), result: inventory.scope1 };
    row.getCell(3).value = { formula: link(subtotalRows.scope2), result: inventory.scope2 };
    row.getCell(4).value = { formula: link(subtotalRows.scope3), result: inventory.scope3 };
    row.getCell(5).value = { formula: link(subtotalRows.total), result: inventory.total };
    row.getCell(6).value = { formula: link(subtotalRows.memo), result: inventory.outsideScopes };
    row.getCell(7).value = inventory.total;
    row.getCell(8).value = { formula: `E${r}-G${r}`, result: 0 };
    for (let c = 2; c <= 8; c++) row.getCell(c).numFmt = FMT_TONNES;
    row.getCell(5).font = { bold: true };
  });
  [8, 14, 14, 14, 18, 20, 16, 12].forEach((width, index) => (summary.getColumn(index + 1).width = width));
  summary.views = [{ state: "frozen", ySplit: SUMMARY_HEAD }];

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, years };
}

export function calculationWorkbookFileName(organisationName: string, years: number[]) {
  const org = (organisationName || "Organisation").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const span = years.length ? (years.length > 1 ? `${years[0]}-${years[years.length - 1]}` : String(years[0])) : "no_data";
  return `GHG_Calculation_Workbook_${org}_${span}.xlsx`;
}
