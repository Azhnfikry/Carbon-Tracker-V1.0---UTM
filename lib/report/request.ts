import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Authenticated Supabase client plus the reporting year from ?year= (defaults to last year).
export async function reportRequest(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Please log in again." }, { status: 401 }) } as const;

  const yearParam = new URL(request.url).searchParams.get("year");
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : new Date().getFullYear() - 1;
  return { supabase, user, year } as const;
}

export const errorResponse = (error: unknown, status = 500) =>
  NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });
