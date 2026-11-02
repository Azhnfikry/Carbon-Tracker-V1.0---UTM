import * as XLSX from "xlsx";
import type { MasterlistRow } from "@/lib/report/types";

export const MASTERLIST_SHEET = "Masterlist";

const HEADER_KEYS: Array<[RegExp, keyof MasterlistRow]> = [
  [/scope/i, "scope_boundary"],
  [/category/i, "category"],
  [/description/i, "description"],
  [/activity data|inputs/i, "activity_inputs"],
  [/evidence/i, "evidence"],
  [/included/i, "included"],
  [/owner/i, "owner"],
  [/remark/i, "remarks"],
  [/data type|metered|invoiced/i, "data_type"],
];

const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();

// Reads the "Masterlist" tab: one row per data category with its inclusion status, evidence and owner.
export function parseMasterlist(workbook: XLSX.WorkBook): MasterlistRow[] {
  const sheetName = workbook.SheetNames.find((name) => name.trim().toLowerCase() === MASTERLIST_SHEET.toLowerCase());
  if (!sheetName) return [];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, blankrows: false });
  const headerIndex = rows.findIndex((row) => row.some((cell) => /category/i.test(clean(cell))));
  if (headerIndex < 0) return [];

  const columns = rows[headerIndex].map((cell) => HEADER_KEYS.find(([pattern]) => pattern.test(clean(cell)))?.[1]);

  return rows
    .slice(headerIndex + 1)
    .map((row) => {
      const entry: MasterlistRow = {
        scope_boundary: "",
        category: "",
        description: "",
        activity_inputs: "",
        evidence: "",
        included: "",
        owner: "",
        remarks: "",
      };
      columns.forEach((key, index) => {
        if (key) entry[key] = clean(row[index]);
      });
      return entry;
    })
    .filter((entry) => entry.category);
}

export function parseMasterlistBuffer(buffer: ArrayBuffer): MasterlistRow[] {
  return parseMasterlist(XLSX.read(buffer, { type: "array" }));
}
