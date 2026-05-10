import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@/lib/supabase/server";
import { calculateEmissionSummary } from "@/lib/emission-calculations";
import type { EmissionEntry, StudentCountEntry } from "@/types/emission";

export const runtime = "nodejs";

type AgentMessage = {
  role: "user" | "assistant";
  content: string;
};

function monthKey(dateValue: string) {
  const date = new Date(dateValue);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildMonthlyContext(entries: EmissionEntry[], studentEntries: StudentCountEntry[]) {
  const monthly = new Map<string, { total: number; scope1: number; scope2: number; scope3: number; count: number }>();

  for (const entry of entries) {
    const key = monthKey(entry.date);
    const current = monthly.get(key) || { total: 0, scope1: 0, scope2: 0, scope3: 0, count: 0 };
    const co2e = entry.co2_equivalent || 0;
    current.total += co2e;
    current.count += 1;
    if (entry.scope === 1) current.scope1 += co2e;
    if (entry.scope === 2) current.scope2 += co2e;
    if (entry.scope === 3) current.scope3 += co2e;
    monthly.set(key, current);
  }

  const sortedStudents = [...studentEntries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const getStudentsForMonth = (key: string) => {
    const [year, month] = key.split("-");
    const monthEnd = new Date(Number(year), Number(month), 0).getTime();
    const latest = sortedStudents.filter((entry) => new Date(entry.date).getTime() <= monthEnd).at(-1);
    return latest?.students || sortedStudents.at(-1)?.students || 0;
  };

  return [...monthly.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => {
      const students = getStudentsForMonth(month);
      return {
        month,
        total_kg_co2e: Number(data.total.toFixed(4)),
        total_tco2e: Number((data.total / 1000).toFixed(6)),
        scope1_kg_co2e: Number(data.scope1.toFixed(4)),
        scope2_kg_co2e: Number(data.scope2.toFixed(4)),
        scope3_kg_co2e: Number(data.scope3.toFixed(4)),
        entries: data.count,
        students,
        tco2e_per_student: students > 0 ? Number(((data.total / 1000) / students).toFixed(8)) : null,
      };
    });
}

function buildDataQualityChecks(entries: EmissionEntry[], studentEntries: StudentCountEntry[]) {
  const checks: string[] = [];
  const monthsWithEmissions = new Set(entries.map((entry) => monthKey(entry.date)));
  const monthsWithStudents = new Set(studentEntries.map((entry) => monthKey(entry.date)));

  const missingStudentMonths = [...monthsWithEmissions].filter((month) => !monthsWithStudents.has(month));
  if (missingStudentMonths.length > 0) {
    checks.push(`${missingStudentMonths.length} emission month(s) do not have an exact student-count row. The app will use the latest available student count.`);
  }

  const invalidEmissions = entries.filter((entry) => !Number.isFinite(entry.co2_equivalent) || entry.co2_equivalent < 0);
  if (invalidEmissions.length > 0) {
    checks.push(`${invalidEmissions.length} emission row(s) have invalid CO2e values.`);
  }

  const zeroStudentRows = studentEntries.filter((entry) => !entry.students || entry.students <= 0);
  if (zeroStudentRows.length > 0) {
    checks.push(`${zeroStudentRows.length} student-count row(s) are zero or invalid.`);
  }

  return checks;
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GOOGLE_GENERATIVE_AI_API_KEY is not configured in environment variables." },
        { status: 500 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const question = String(body.question || "").trim();
    const messages = Array.isArray(body.messages) ? (body.messages as AgentMessage[]) : [];

    if (!question) {
      return NextResponse.json({ error: "Question is required." }, { status: 400 });
    }

    const [{ data: emissions, error: emissionsError }, { data: studentCounts, error: studentError }, { data: companyInfo }] =
      await Promise.all([
        supabase.from("emissions").select("*").eq("user_id", user.id).order("date", { ascending: true }),
        supabase.from("student_counts").select("*").eq("user_id", user.id).order("date", { ascending: true }),
        supabase.from("company_info").select("*").eq("user_id", user.id).maybeSingle(),
      ]);

    if (emissionsError) throw emissionsError;
    if (studentError) throw studentError;

    const entries = (emissions || []) as EmissionEntry[];
    const students = (studentCounts || []) as StudentCountEntry[];
    const summary = calculateEmissionSummary(entries);
    const monthly = buildMonthlyContext(entries, students);
    const qualityChecks = buildDataQualityChecks(entries, students);
    const latestStudents = [...students].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.students || 0;
    const totalTco2e = summary.totalEmissions / 1000;

    const context = {
      company: {
        name: companyInfo?.company_name || "Unknown",
        reporting_period: companyInfo?.reporting_period || "",
        business_description: companyInfo?.business_description || "",
      },
      summary: {
        total_kg_co2e: Number(summary.totalEmissions.toFixed(4)),
        total_tco2e: Number(totalTco2e.toFixed(6)),
        scope1_kg_co2e: Number(summary.scope1.toFixed(4)),
        scope2_kg_co2e: Number(summary.scope2.toFixed(4)),
        scope3_kg_co2e: Number(summary.scope3.toFixed(4)),
        latest_students: latestStudents,
        tco2e_per_student: latestStudents > 0 ? Number((totalTco2e / latestStudents).toFixed(8)) : null,
        categories: summary.byCategory,
        emission_rows: entries.length,
        student_rows: students.length,
      },
      monthly,
      quality_checks: qualityChecks,
    };

    const recentConversation = messages
      .slice(-8)
      .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}: ${message.content}`)
      .join("\n");

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            {
              text: `You are a read-only carbon accounting AI agent inside a GHG dashboard.

Your job:
- Answer questions using only the provided app data.
- Explain emissions, scopes, categories, monthly trends, and tCO2e/student clearly.
- Highlight data gaps, suspicious patterns, and next actions.
- Never claim you changed database records. You can recommend actions, but users must approve changes manually.
- If the data is insufficient, say exactly what is missing.
- Keep answers concise, practical, and audit-friendly.

App data:
${JSON.stringify(context, null, 2)}

Recent conversation:
${recentConversation || "None"}

User question:
${question}`,
            },
          ],
        },
      ],
    });

    return NextResponse.json({
      answer: response.text || "I could not generate a response.",
      context: {
        emissionRows: entries.length,
        studentRows: students.length,
        qualityChecks,
      },
    });
  } catch (error) {
    console.error("AI agent error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run AI agent." },
      { status: 500 }
    );
  }
}
