import fs from "fs";
import path from "path";
import Handlebars from "handlebars";
import { getBrand, TEMPLATE_IMAGE_PATHS, type Brand, type BrandImages } from "@/lib/report/brand";
import type { ReportContext } from "@/lib/report/build-context";
import { monthlyStackedChart, scopeBarChart } from "@/lib/report/charts";
import { NARRATIVE_KEYS, REQUIRED_SETTINGS, type NarrativeState, type ReportSettings } from "@/lib/report/types";

export const TEMPLATE_DIR = path.join(process.cwd(), "templates");
const TEMPLATE_FILE = path.join(TEMPLATE_DIR, "ghg_inventory_report.hbs");

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };

let compiled: Handlebars.TemplateDelegate | null = null;
const dataUris = new Map<string, string>();

function template() {
  if (!compiled || process.env.NODE_ENV !== "production") {
    compiled = Handlebars.compile(fs.readFileSync(TEMPLATE_FILE, "utf8"));
  }
  return compiled;
}

function dataUri(file: string) {
  let uri = dataUris.get(file);
  if (!uri) {
    const fullPath = path.join(TEMPLATE_DIR, "assets", file);
    uri = `data:${MIME[path.extname(file).toLowerCase()] || "application/octet-stream"};base64,${fs.readFileSync(fullPath).toString("base64")}`;
    dataUris.set(file, uri);
  }
  return uri;
}

// Swaps each template image path for the brand's image as a base64 data URI, so the HTML is self-contained.
function embedImages(html: string, brand: Brand) {
  return (Object.keys(TEMPLATE_IMAGE_PATHS) as Array<keyof BrandImages>).reduce(
    (output, slot) => output.split(TEMPLATE_IMAGE_PATHS[slot]).join(dataUri(brand.images[slot])),
    html
  );
}

function brandStyle(brand: Brand) {
  const { maroon, red, charcoal, grey, mist } = brand.colours;
  return `<style>:root{--maroon:${maroon};--red:${red};--charcoal:${charcoal};--grey:${grey};--mist:${mist};}</style>`;
}

export type ReportMode = "draft" | "final";

// Renders the report HTML. Draft shows guide tags and instruction boxes; final hides them.
export function renderReportHtml(context: ReportContext, options: { mode: ReportMode; brandId?: string | null }) {
  const brand = getBrand(options.brandId);
  const totals = context._totals;
  const html = template()({
    ...context,
    chart_scope_svg: scopeBarChart(
      [
        { label: "Scope 1 – Direct", value: totals.scope1 },
        { label: "Scope 2 – Electricity", value: totals.scope2 },
        { label: "Scope 3 – Other indirect", value: totals.scope3 },
      ],
      brand.scopeColours
    ),
    chart_monthly_svg: monthlyStackedChart(totals.monthlyByScope, brand.scopeColours),
  });

  let output = embedImages(html, brand).replace("</head>", `${brandStyle(brand)}\n</head>`);
  // Anchored to the start of a line: the template's header comment also mentions <body>.
  if (options.mode === "final") output = output.replace(/^<body>/m, '<body class="final">');
  return output;
}

// Lists what still blocks a final export: empty MANUAL fields, unapproved or empty AI fields,
// and Excluded boundary categories without a recorded reason.
// Every Excluded boundary category must have a recorded reason.
export function finalExportBlockers(
  settings: ReportSettings,
  narrative: NarrativeState,
  boundary: Array<{ scope_category: string; status: string; reason: string }> = []
): string[] {
  const missing = REQUIRED_SETTINGS.filter(({ key }) => !String(settings[key] || "").trim()).map(({ label }) => label);
  for (const row of boundary) {
    if (row.status === "Excluded" && !row.reason) missing.push(`Reason for excluding "${row.scope_category}"`);
  }
  for (const key of NARRATIVE_KEYS) {
    const value = narrative.fields[key];
    const label = `AI field "${key.replace(/_/g, " ")}"`;
    if (Array.isArray(value) ? value.length === 0 : !String(value || "").trim()) missing.push(`${label} is empty`);
    else if (!narrative.approved[key]) missing.push(`${label} is not approved`);
  }
  return missing;
}

export function reportFileName(settings: ReportSettings, year: number | string) {
  const clean = (value: string) => value.trim().replace(/[^A-Za-z0-9.]+/g, "_").replace(/^_|_$/g, "");
  return `GHG_Inventory_${clean(settings.organisation_name) || "Organisation"}_${year}_${clean(settings.report_version) || "1.0"}.pdf`;
}
