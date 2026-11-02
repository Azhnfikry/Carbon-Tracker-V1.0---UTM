import { GoogleGenAI } from "@google/genai";
import type { ReportContext } from "@/lib/report/build-context";
import type { NarrativeFields, NarrativeKey, NarrativeState, RecommendationRow } from "@/lib/report/types";

// Field prompts, taken from the instruction boxes in ghg_inventory_report.hbs.
const FIELD_INSTRUCTIONS: Record<NarrativeKey, string> = {
  exec_summary_paragraph:
    "3–4 sentences. State the total, the largest source and its share, the second and third sources, and the most important data gap. Use only figures from Section 5. No forecasts.",
  exec_recommendations_paragraph: "Name the top 3 actions from the recommendations in one short paragraph.",
  hotspot_analysis:
    "2–4 short paragraphs, one per major source, separated by blank lines. Explain what drives each source and notable monthly patterns or outliers from the monthly data. Use only calculated figures. Do not estimate costs or forecasts.",
  improvement_plan:
    "One short paragraph on how to close the data gaps listed (missing months, excluded categories, outliers to verify) before the next inventory.",
  recommendations:
    "4–6 actions ranked by the size of the source they address. Show the emissions of the source (source_tco2e, copied exactly from source_rows), not an estimated saving. Effort: Low / Medium / High. Timeframe: Short (<1 yr) / Medium (1–3 yrs) / Long (>3 yrs).",
};

// The only data the AI sees: final calculated results, source rows and data gaps.
export function narrativeInput(context: ReportContext) {
  return {
    organisation: context.organisation_name,
    campus: context.campus_name,
    reporting_year: context.reporting_year,
    results_tco2e: {
      total: context.total_tco2e,
      scope1: context.scope1_tco2e,
      scope1_pct: context.scope1_pct,
      scope2: context.scope2_tco2e,
      scope2_pct: context.scope2_pct,
      scope3: context.scope3_tco2e,
      scope3_pct: context.scope3_pct,
      outside_scopes_hcfc: context.outside_scopes_tco2e,
    },
    source_rows: context.source_rows,
    monthly_activity: context.activity_rows,
    boundary: context.boundary_rows,
    data_gaps: context.data_gaps,
  };
}

const NUMBER_PATTERN = /\d[\d,]*(?:\.\d+)?/g;
const normalizeNumber = (value: string) => value.replace(/,/g, "").replace(/\.0+$/, "").replace(/^0+(?=\d)/, "");

// Numbers in `text` that do not appear anywhere in the data given to the AI.
export function unsupportedNumbers(text: string, data: unknown): string[] {
  const allowed = new Set((JSON.stringify(data).match(NUMBER_PATTERN) || []).map(normalizeNumber));
  // Section and scope numbers that appear in plain prose.
  ["1", "2", "3"].forEach((value) => allowed.add(value));
  const found = (text.match(NUMBER_PATTERN) || []).map((value) => value.replace(/[.,]$/, ""));
  return Array.from(new Set(found.filter((value) => !allowed.has(normalizeNumber(value)))));
}

function flagNarrative(fields: NarrativeFields, data: unknown): NarrativeState["flags"] {
  const flags: NarrativeState["flags"] = {};
  for (const key of Object.keys(fields) as NarrativeKey[]) {
    const value = fields[key];
    const text = Array.isArray(value)
      ? value.map((row) => `${row.action} ${row.source} ${row.source_tco2e}`).join(" ")
      : String(value || "");
    const numbers = unsupportedNumbers(text, data);
    if (numbers.length > 0) flags[key] = numbers;
  }
  return flags;
}

export function validateNarrative(fields: NarrativeFields, context: ReportContext) {
  return flagNarrative(fields, narrativeInput(context));
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    exec_summary_paragraph: { type: "string" },
    exec_recommendations_paragraph: { type: "string" },
    hotspot_analysis: { type: "string" },
    improvement_plan: { type: "string" },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: { type: "string" },
          source: { type: "string" },
          source_tco2e: { type: "string" },
          effort: { type: "string", enum: ["Low", "Medium", "High"] },
          timeframe: { type: "string", enum: ["Short (<1 yr)", "Medium (1–3 yrs)", "Long (>3 yrs)"] },
        },
        required: ["action", "source", "source_tco2e", "effort", "timeframe"],
      },
    },
  },
  required: ["exec_summary_paragraph", "exec_recommendations_paragraph", "hotspot_analysis", "improvement_plan", "recommendations"],
};

// Drafts the AI fields from the final calculated context. Returns drafts plus flagged numbers;
// nothing is approved until the consultant reviews it.
export async function draftNarrative(context: ReportContext): Promise<NarrativeState> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not configured.");

  const data = narrativeInput(context);
  const instructions = (Object.keys(FIELD_INSTRUCTIONS) as NarrativeKey[])
    .map((key) => `- ${key}: ${FIELD_INSTRUCTIONS[key]}`)
    .join("\n");

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            text: `You draft narrative sections of a GHG emissions inventory report (GHG Protocol Corporate Standard) for consultant review.

Rules:
- Use only the figures in the data below, written exactly as given (e.g. "8,357.3 tCO2e", "67.8%"). Units are tCO2e.
- Do not calculate, round, sum or invent any number. No costs, savings, forecasts, targets or carbon tax figures.
- Plain, factual British English. No marketing language.

Fields to write:
${instructions}

Data:
${JSON.stringify(data)}`,
          },
        ],
      },
    ],
    config: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, temperature: 0.2 },
  });

  const parsed = JSON.parse(response.text || "{}") as Partial<NarrativeFields>;
  const sourceTonnes = new Map(context.source_rows.map((row) => [row.source.toLowerCase(), row.tco2e]));
  const recommendations: RecommendationRow[] = (parsed.recommendations || []).slice(0, 6).map((row) => ({
    action: String(row.action || ""),
    source: String(row.source || ""),
    // Source emissions always come from the calculation, never from the AI.
    source_tco2e: sourceTonnes.get(String(row.source || "").toLowerCase()) || String(row.source_tco2e || ""),
    effort: String(row.effort || ""),
    timeframe: String(row.timeframe || ""),
  }));

  const fields: NarrativeFields = {
    exec_summary_paragraph: String(parsed.exec_summary_paragraph || ""),
    exec_recommendations_paragraph: String(parsed.exec_recommendations_paragraph || ""),
    hotspot_analysis: String(parsed.hotspot_analysis || ""),
    improvement_plan: String(parsed.improvement_plan || ""),
    recommendations,
  };

  return { fields, approved: {}, flags: flagNarrative(fields, data), generated_at: new Date().toISOString() };
}
