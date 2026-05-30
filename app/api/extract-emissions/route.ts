import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

// Dynamic imports for optional dependencies
let pdfParse: any;
let mammoth: any;

const getPdfParse = async () => {
  if (!pdfParse) {
    pdfParse = await import("pdf-parse");
  }
  return pdfParse;
};

const getMammoth = async () => {
  if (!mammoth) {
    mammoth = await import("mammoth");
  }
  return mammoth;
};

interface ExtractedEmissionData {
  "Activity Type": string;
  Scope: string;
  Quantity: string;
  Unit: string;
  Facility?: string;
  Year?: string;
  Month?: string;
  Date?: string;
}

const MONTH_LOOKUP: Record<string, string> = {
  "1": "01",
  "01": "01",
  january: "01",
  jan: "01",
  "2": "02",
  "02": "02",
  february: "02",
  feb: "02",
  "3": "03",
  "03": "03",
  march: "03",
  mar: "03",
  "4": "04",
  "04": "04",
  april: "04",
  apr: "04",
  "5": "05",
  "05": "05",
  may: "05",
  "6": "06",
  "06": "06",
  june: "06",
  jun: "06",
  "7": "07",
  "07": "07",
  july: "07",
  jul: "07",
  "8": "08",
  "08": "08",
  august: "08",
  aug: "08",
  "9": "09",
  "09": "09",
  september: "09",
  sep: "09",
  sept: "09",
  "10": "10",
  october: "10",
  oct: "10",
  "11": "11",
  november: "11",
  nov: "11",
  "12": "12",
  december: "12",
  dec: "12",
};

function normalizeMonthValue(value: any): string | undefined {
  if (value === null || value === undefined) return undefined;
  const normalizedMonth = String(value).trim().toLowerCase();
  return MONTH_LOOKUP[normalizedMonth];
}

function extractYearMonthFromValue(value: any): { year?: string; month?: string } {
  if (value === null || value === undefined) return {};

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      year: String(value.getFullYear()),
      month: String(value.getMonth() + 1).padStart(2, "0"),
    };
  }

  if (typeof value === "number" && value > 20000 && value < 60000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m) {
      return {
        year: String(parsed.y),
        month: String(parsed.m).padStart(2, "0"),
      };
    }
  }

  const text = String(value).trim();
  if (!text) return {};

  const yearMatch = text.match(/\b(19\d{2}|20\d{2})\b/);

  const slashMonthYearMatch = text.match(/^(\d{1,2})[\/-](19\d{2}|20\d{2})$/);
  if (slashMonthYearMatch) {
    return {
      month: String(parseInt(slashMonthYearMatch[1], 10)).padStart(2, "0"),
      year: slashMonthYearMatch[2],
    };
  }

  const yearSlashMonthMatch = text.match(/^(19\d{2}|20\d{2})[\/-](\d{1,2}|[A-Za-z]{3,9})$/);
  if (yearSlashMonthMatch) {
    const normalizedMonth = normalizeMonthValue(yearSlashMonthMatch[2]);
    return {
      year: yearSlashMonthMatch[1],
      month: normalizedMonth,
    };
  }

  const monthNameMatch = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i
  );

  const month = monthNameMatch ? normalizeMonthValue(monthNameMatch[1]) : normalizeMonthValue(text);
  const year = yearMatch ? yearMatch[1] : undefined;

  return { year, month };
}

function inferRowDateMetadata(
  row: any[],
  currentYear: any,
  currentMonth: any
): { year: any; month: any } {
  let inferredYear = currentYear;
  let inferredMonth = currentMonth;

  for (const cell of row) {
    const { year, month } = extractYearMonthFromValue(cell);
    if (!inferredYear && year) {
      inferredYear = year;
    }
    if (!inferredMonth && month) {
      inferredMonth = month;
    }
    if (inferredYear && inferredMonth) {
      break;
    }
  }

  return { year: inferredYear, month: inferredMonth };
}

function buildNormalizedDate(year: any, month: any): string | undefined {
  const normalizedYear = year !== null && year !== undefined ? String(year).trim() : "";
  const normalizedMonth = month !== null && month !== undefined ? String(month).trim() : "";

  if (!normalizedYear) return undefined;

  if (!normalizedMonth) {
    return /^\d{4}$/.test(normalizedYear) ? `${normalizedYear}-01-01` : undefined;
  }

  const monthNumber = normalizeMonthValue(normalizedMonth);

  if (/^\d{4}$/.test(normalizedYear) && monthNumber) {
    return `${normalizedYear}-${monthNumber}-01`;
  }

  return undefined;
}

function extractSheetDateMetadata(
  rawData: any[][],
  sheetName: string,
  headerRowIndex: number
): { year?: string; month?: string } {
  const metadata: { year?: string; month?: string } = {};
  const linesToInspect = [
    sheetName,
    ...rawData
      .slice(0, Math.max(headerRowIndex, 0) + 1)
      .map((row) => row.filter((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "").join(" "))
      .filter(Boolean),
  ];

  for (const line of linesToInspect) {
    if (!metadata.year) {
      const yearMatch = String(line).match(/\b(20\d{2}|19\d{2})\b/);
      if (yearMatch) {
        metadata.year = yearMatch[1];
      }
    }

    if (!metadata.month) {
      for (const token of String(line).split(/[^A-Za-z0-9]+/)) {
        const monthNumber = normalizeMonthValue(token);
        if (monthNumber) {
          metadata.month = monthNumber;
          break;
        }
      }
    }

    const explicitMonthMatch = String(line).match(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i
    );
    if (!metadata.month && explicitMonthMatch) {
      metadata.month = normalizeMonthValue(explicitMonthMatch[1]);
    }

    if (metadata.year && metadata.month) {
      break;
    }
  }

  return metadata;
}

// Helper function to extract data from CSV
function extractFromCSV(text: string): ExtractedEmissionData[] {
  const lines = text.split("\n");
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const emissions: ExtractedEmissionData[] = [];

  // Find column indices
  const activityIndex = headers.findIndex((h) => h.includes("activity"));
  const scopeIndex = headers.findIndex((h) => h.includes("scope"));
  const quantityIndex = headers.findIndex((h) => h.includes("quantity"));
  const unitIndex = headers.findIndex((h) => h.includes("unit"));
  const facilityIndex = headers.findIndex((h) => h.includes("facility"));

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;

    const row = lines[i].split(",").map((cell) => cell.trim());
    if (
      row.length > Math.max(activityIndex, scopeIndex, quantityIndex, unitIndex)
    ) {
      emissions.push({
        "Activity Type": activityIndex >= 0 ? row[activityIndex] : "Unknown",
        Scope: scopeIndex >= 0 ? row[scopeIndex] : "Scope 1",
        Quantity: quantityIndex >= 0 ? row[quantityIndex] : "0",
        Unit: unitIndex >= 0 ? row[unitIndex] : "kg",
        Facility: facilityIndex >= 0 ? row[facilityIndex] : undefined,
      });
    }
  }

  return emissions;
}

// Helper function to clean column headers
function cleanHeader(header: string): string {
  if (!header || typeof header !== "string") return "";
  
  // Remove newlines and extra whitespace
  return header
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Helper function to check if a row is likely a header row
function isHeaderRow(row: any[]): boolean {
  const nonEmptyCells = row.filter(cell => cell !== null && cell !== undefined && cell !== "");
  
  // Check if row contains typical header keywords
  const headerKeywords = [
    "year", "month", "fuel", "electricity", "water", "waste",
    "livestock", "refrigerant", "amount", "total", "number",
    "litre", "kwh", "kg", "m3", "btu", "head"
  ];
  
  const hasHeaderKeywords = nonEmptyCells.some(cell => {
    if (typeof cell !== "string") return false;
    const lowerCell = cell.toLowerCase();
    return headerKeywords.some(keyword => lowerCell.includes(keyword));
  });
  
  return hasHeaderKeywords && nonEmptyCells.length >= 2;
}

function shouldMergeWithNextHeaderRow(currentRow: any[], nextRow: any[] | undefined): boolean {
  if (!nextRow) return false;

  const nextHeaders = nextRow
    .map((cell) => cleanHeader(cell ? String(cell) : ""))
    .filter(Boolean)
    .map((cell) => cell.toLowerCase());

  return nextHeaders.some((cell) =>
    cell === "year" ||
    cell === "month" ||
    cell.includes("topup") ||
    cell.includes("total")
  );
}

function buildHeadersFromRows(primaryRow: any[], secondaryRow?: any[]): string[] {
  const maxLength = Math.max(primaryRow.length, secondaryRow?.length || 0);
  const headers: string[] = [];

  for (let idx = 0; idx < maxLength; idx++) {
    const primary = cleanHeader(primaryRow[idx] ? String(primaryRow[idx]) : "");
    const secondary = cleanHeader(secondaryRow?.[idx] ? String(secondaryRow[idx]) : "");

    if (secondary) {
      const secondaryLower = secondary.toLowerCase();
      if (secondaryLower === "year" || secondaryLower === "month") {
        headers.push(secondary);
        continue;
      }

      if (primary && secondaryLower !== primary.toLowerCase()) {
        headers.push(`${primary} - ${secondary}`);
        continue;
      }
    }

    headers.push(primary || secondary || `Column_${idx}`);
  }

  return headers;
}

// Helper function to check if value is valid emission data
function isValidEmissionValue(value: any): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (value === "-" || value === "NA" || value === "N/A") return false;
  
  // Check if it's a number or can be converted to number
  if (typeof value === "number") return value !== 0;
  
  if (typeof value === "string") {
    const cleaned = value.toString().replace(/,/g, "").trim();
    if (cleaned === "" || cleaned === "0") return false;
    const num = parseFloat(cleaned);
    return !isNaN(num) && num !== 0;
  }
  
  return false;
}

// Helper function to extract data from Excel (FIXED VERSION)
async function extractFromExcel(buffer: Uint8Array): Promise<ExtractedEmissionData[]> {
  try {
    const workbook = XLSX.read(buffer, { type: "array" });
    
    console.log("Excel workbook sheets:", workbook.SheetNames);
    
    const emissions: ExtractedEmissionData[] = [];

    // Process multiple sheets - skip info sheets and process data sheets
    const relevantSheets = workbook.SheetNames.filter(
      (sheet) =>
        sheet.toLowerCase().includes("scope") ||
        sheet.toLowerCase().includes("emission") ||
        sheet.toLowerCase().includes("transport") ||
        sheet.toLowerCase().includes("combustion") ||
        sheet.toLowerCase().includes("electricity") ||
        sheet.toLowerCase().includes("waste") ||
        sheet.toLowerCase().includes("water") ||
        sheet.toLowerCase().includes("livestock") ||
        sheet.toLowerCase().includes("refrigerant")
    );

    console.log("Processing sheets:", relevantSheets);

    for (const sheetName of relevantSheets) {
      const worksheet = workbook.Sheets[sheetName];
      
      if (!worksheet) continue;

      // Get raw data from sheet
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      const rawData: any[][] = [];
      
      for (let R = range.s.r; R <= range.e.r; ++R) {
        const row: any[] = [];
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = worksheet[cellAddress];
          row.push(cell ? cell.v : null);
        }
        rawData.push(row);
      }

      console.log(`Sheet "${sheetName}": ${rawData.length} total rows`);

      // Find header row
      let headerRowIndex = -1;
      let headers: string[] = [];
      
      for (let i = 0; i < Math.min(rawData.length, 15); i++) {
        if (isHeaderRow(rawData[i])) {
          const mergeNextRow = shouldMergeWithNextHeaderRow(rawData[i], rawData[i + 1]);
          headerRowIndex = mergeNextRow ? i + 1 : i;
          headers = buildHeadersFromRows(rawData[i], mergeNextRow ? rawData[i + 1] : undefined);
          console.log(`Found headers at row ${i + 1}:`, headers);
          break;
        }
      }

      if (headerRowIndex === -1) {
        console.warn(`No header row found in sheet: ${sheetName}`);
        continue;
      }

      const sheetDateMetadata = extractSheetDateMetadata(rawData, sheetName, headerRowIndex);
      console.log(`Sheet-level date metadata for "${sheetName}":`, sheetDateMetadata);

      // Find Year and Month column indices
      const yearIndex = headers.findIndex(h => 
        h.toLowerCase() === "year" || h.toLowerCase().includes("year")
      );
      const monthIndex = headers.findIndex(h => 
        h.toLowerCase() === "month" || h.toLowerCase().includes("month")
      );

      console.log(`Year column: ${yearIndex >= 0 ? headers[yearIndex] : 'Not found'}`);
      console.log(`Month column: ${monthIndex >= 0 ? headers[monthIndex] : 'Not found'}`);

      // Process data rows (starting after header)
      let dataRowCount = 0;
      let currentYear: any = sheetDateMetadata.year ?? null;
      let currentMonth: any = sheetDateMetadata.month ?? null;

      for (let i = headerRowIndex + 1; i < rawData.length; i++) {
        const row = rawData[i];
        
        // Skip completely empty rows
        if (row.every(cell => !cell)) continue;

        // Carry forward year/month values when grouped Excel rows leave them blank
        const rowYear = yearIndex >= 0 ? row[yearIndex] : null;
        const rowMonth = monthIndex >= 0 ? row[monthIndex] : null;

        if (rowYear !== null && rowYear !== undefined && String(rowYear).trim() !== "") {
          currentYear = rowYear;
        }

        if (rowMonth !== null && rowMonth !== undefined && String(rowMonth).trim() !== "") {
          currentMonth = rowMonth;
        }

        if (!currentYear || !currentMonth) {
          const inferredRowMetadata = inferRowDateMetadata(row, currentYear, currentMonth);
          currentYear = inferredRowMetadata.year;
          currentMonth = inferredRowMetadata.month;
        }

        const normalizedDate = buildNormalizedDate(currentYear, currentMonth);
        const dateLabel = (currentYear && currentMonth) ? `${currentYear}/${currentMonth}` :
                         currentYear ? `${currentYear}` : "";

        // Process each column (skip Year and Month columns)
        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
          // Skip year, month, and empty columns
          if (colIdx === yearIndex || colIdx === monthIndex) continue;
          if (!headers[colIdx] || headers[colIdx].startsWith("Column_")) continue;

          const value = row[colIdx];
          
          // Only process valid emission values
          if (isValidEmissionValue(value)) {
            const columnName = headers[colIdx];
            
            // Create emission record
            emissions.push({
              "Activity Type": `${sheetName} - ${columnName}${dateLabel ? ` (${dateLabel})` : ""}`,
              Scope: extractScopeFromSheet(sheetName),
              Quantity: String(value).replace(/,/g, ""),
              Unit: extractUnitFromColumn(columnName, sheetName),
              Year: currentYear ? String(currentYear) : undefined,
              Month: currentMonth ? String(currentMonth) : undefined,
              Date: normalizedDate,
            });
            dataRowCount++;
          }
        }
      }

      console.log(`Extracted ${dataRowCount} emission records from "${sheetName}"`);
    }

    console.log(`Total emissions extracted: ${emissions.length}`);
    return emissions;
  } catch (error) {
    console.error("Excel extraction error:", error);
    throw new Error(
      `Failed to parse Excel file: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

// Helper function to extract scope from sheet name
function extractScopeFromSheet(sheetName: string): string {
  const lower = sheetName.toLowerCase();
  if (lower.includes("scope 1")) return "Scope 1";
  if (lower.includes("scope 2")) return "Scope 2";
  if (lower.includes("scope 3")) return "Scope 3";
  return "Scope 1";
}

// Helper function to extract unit from column name or sheet name
function extractUnitFromColumn(columnName: string, sheetName: string): string {
  const lower = columnName.toLowerCase();
  
  // Check column name first for explicit units
  if (lower.includes("kwh")) return "kWh";
  if (lower.includes("litre") || lower.includes("liter")) return "L";
  if (lower.includes("kg") || lower.includes("kilogram")) return "kg";
  if (lower.includes("m3") || lower.includes("m³") || lower.includes("cubic")) return "m³";
  if (lower.includes("btu")) return "BTU";
  if (lower.includes("sm3")) return "Sm³";
  if (lower.includes("head")) return "head";
  if (lower.includes("ton") || lower.includes("tonne") || lower.includes("tan metrik")) return "tonnes";
  if (lower.includes("acre")) return "acre";
  if (lower.includes("people") || lower.includes("person")) return "people";
  
  // Fallback to sheet-based unit detection
  const sheetLower = sheetName.toLowerCase();
  if (sheetLower.includes("electricity")) return "kWh";
  if (sheetLower.includes("transport") || sheetLower.includes("combustion")) return "L";
  if (sheetLower.includes("waste")) return "kg";
  if (sheetLower.includes("water")) return "m³";
  if (sheetLower.includes("livestock")) return "head";
  if (sheetLower.includes("refrigerant")) return "kg";
  
  return "units";
}

// Helper function to extract text from PDF
async function extractFromPDF(buffer: Uint8Array): Promise<string> {
  try {
    const pdfParseModule = await getPdfParse();
    const data = await pdfParseModule.default(buffer);
    return data.text;
  } catch (error) {
    throw new Error(
      `Failed to parse PDF: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

// Helper function to extract text from DOCX
async function extractFromDOCX(buffer: Uint8Array): Promise<string> {
  try {
    const mammothModule = await getMammoth();
    const result = await mammothModule.extractRawText({ arrayBuffer: buffer });
    return result.value;
  } catch (error) {
    throw new Error(
      `Failed to parse DOCX: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

// Helper function to extract emissions from text using pattern matching
function extractEmissionsFromText(text: string): ExtractedEmissionData[] {
  const emissions: ExtractedEmissionData[] = [];

  // Simple pattern matching for emission data
  const activityMatches = text.match(
    /(?:activity|process|source)[:\s]*([^\n,]*)/gi
  );
  const scopeMatches = text.match(/scope\s*[1-3]|scope[:\s]*([^\n,]*)/gi);
  const quantityMatches = text.match(/quantity[:\s]*([0-9.]+)/gi);
  const unitMatches = text.match(/unit[:\s]*([^\n,]*)/gi);

  if (activityMatches && activityMatches.length > 0) {
    for (let i = 0; i < Math.min(activityMatches.length, 1); i++) {
      emissions.push({
        "Activity Type": activityMatches[i] || "Unknown",
        Scope: scopeMatches ? scopeMatches[0] : "Scope 1",
        Quantity: quantityMatches ? quantityMatches[0] : "0",
        Unit: unitMatches ? unitMatches[0] : "kg",
      });
    }
  }

  return emissions;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    const fileType = file.type;
    const fileName = file.name.toLowerCase();
    const buffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);

    let emissions: ExtractedEmissionData[] = [];

    // Route based on file type
    if (fileType === "text/csv" || fileName.endsWith(".csv")) {
      const text = new TextDecoder().decode(uint8Array);
      emissions = extractFromCSV(text);
    } else if (
      fileType ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      fileType === "application/vnd.ms-excel" ||
      fileName.endsWith(".xlsx") ||
      fileName.endsWith(".xls")
    ) {
      emissions = await extractFromExcel(uint8Array);
    } else if (fileType === "application/pdf" || fileName.endsWith(".pdf")) {
      const text = await extractFromPDF(uint8Array);
      emissions = extractEmissionsFromText(text);
    } else if (
      fileType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fileName.endsWith(".docx")
    ) {
      const text = await extractFromDOCX(uint8Array);
      emissions = extractEmissionsFromText(text);
    } else {
      return NextResponse.json(
        { error: `Unsupported file type: ${fileType}` },
        { status: 400 }
      );
    }

    if (emissions.length === 0) {
      return NextResponse.json(
        {
          error: "No emission data found in the file",
          hint: "Please ensure your file contains emission activity data with numeric values",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      emissions,
      extractedData: emissions,
      count: emissions.length,
      message: `Successfully extracted ${emissions.length} emission data records`,
    });
  } catch (error) {
    console.error("Error processing file:", error);
    return NextResponse.json(
      {
        error: `Failed to process file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      },
      { status: 500 }
    );
  }
}
