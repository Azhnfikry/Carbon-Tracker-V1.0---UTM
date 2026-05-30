import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { buildEmissionForecast } from '@/lib/emission-forecast';
import { buildScenarioAnalysis, type ScenarioInputs } from '@/lib/emission-scenario';

type EmissionRow = {
  scope: number | string | null;
  co2_equivalent?: number | string | null;
  total_emissions?: number | string | null;
  co2Equivalent?: number | string | null;
  co2?: number | string | null;
  ch4?: number | string | null;
  n2o?: number | string | null;
  description?: string | null;
  activity_type?: string | null;
  category?: string | null;
  date?: string | null;
  created_at?: string | null;
};

type ScopeGasTotals = {
  mtco2e: number;
  co2_mt: number;
  ch4_mt: number;
  n2o_mt: number;
  hfcs_mt: number;
  pfcs_mt: number;
  sf6_mt: number;
};

type StudentCountRow = {
  date: string | null;
  students: number | string | null;
};

const DEFAULT_SCENARIO_INPUTS: ScenarioInputs = {
  solarAdoptionPercent: 30,
  evFleetPercent: 20,
  supplierSwitchPercent: 15,
  carbonTaxRate: 60,
};

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
});

const emptyScopeTotals = (): ScopeGasTotals => ({
  mtco2e: 0,
  co2_mt: 0,
  ch4_mt: 0,
  n2o_mt: 0,
  hfcs_mt: 0,
  pfcs_mt: 0,
  sf6_mt: 0,
});

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;

  const parsed = typeof value === 'number'
    ? value
    : parseFloat(String(value).replace(/,/g, '').trim());

  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch (error) {
              console.warn('Cookie setting error:', error);
            }
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error('Auth error details:', {
        message: authError.message,
        status: authError.status,
        code: authError.code,
      });
      return NextResponse.json(
        { error: `Authentication failed: ${authError.message}` },
        { status: 401 }
      );
    }

    if (!user) {
      console.error('No user found in session');
      return NextResponse.json(
        { error: 'User session not found. Please log in again.' },
        { status: 401 }
      );
    }

    console.log('Authenticated user:', user.id);

    const { data: emissions, error } = await supabase
      .from('emissions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Emissions fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch emissions: ' + error.message },
        { status: 500 }
      );
    }

    const emptyEmissions = {
      scope1: emptyScopeTotals(),
      scope2: emptyScopeTotals(),
      scope3: emptyScopeTotals(),
      total: 0,
    };

    if (!emissions) {
      console.warn('No emissions found for user:', user.id);
      const emptyReport = {
        generated_at: new Date().toLocaleString(),
        company_info: {
          name: 'N/A',
          description: '',
          consolidation_approach: '',
          business_description: '',
          reporting_period: '',
          base_year: new Date().getFullYear(),
          base_year_rationale: '',
        },
        user_name: 'User',
        user_email: user.email || 'N/A',
        scope_1_total: 0,
        scope_2_total: 0,
        scope_3_total: 0,
        total_emissions: 0,
        emissions: emptyEmissions,
      };
      return NextResponse.json(emptyReport);
    }

    console.log(`Found ${emissions.length} emissions for user`);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, job_title, email')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.warn('Profile fetch warning:', profileError.message);
    }

    const { data: studentCounts, error: studentCountsError } = await supabase
      .from('student_counts')
      .select('date, students')
      .eq('user_id', user.id)
      .order('date', { ascending: true });

    if (studentCountsError) {
      console.warn('Student counts fetch warning:', studentCountsError.message);
    }

    const processedEmissions = (emissions as EmissionRow[]).map((emission) => {
      const totalEmissions = toNumber(
        emission.co2_equivalent ??
        emission.total_emissions ??
        emission.co2Equivalent
      );

      return {
        ...emission,
        scope: Number(emission.scope) || 0,
        total_emissions: totalEmissions,
        co2: toNumber(emission.co2),
        ch4: toNumber(emission.ch4),
        n2o: toNumber(emission.n2o),
        activity_description: emission.description || emission.activity_type || '-',
      };
    });

    console.log('Processed emissions count:', processedEmissions.length);

    let companyInfo = null;
    const { data: companyData, error: companyError } = await supabase
      .from('company_info')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (companyError) {
      console.warn('Company info fetch warning:', companyError.message);
    } else if (companyData) {
      companyInfo = companyData;
    }

    const calculateScopeGasTotals = (scope: number): ScopeGasTotals => {
      const scopeEmissions = processedEmissions.filter((e) => e.scope === scope);

      return {
        mtco2e: round2(
          scopeEmissions.reduce((sum, e) => sum + e.total_emissions, 0)
        ),
        co2_mt: round2(
          scopeEmissions.reduce((sum, e) => sum + e.co2, 0)
        ),
        ch4_mt: round2(
          scopeEmissions.reduce((sum, e) => sum + e.ch4, 0)
        ),
        n2o_mt: round2(
          scopeEmissions.reduce((sum, e) => sum + e.n2o, 0)
        ),
        hfcs_mt: 0,
        pfcs_mt: 0,
        sf6_mt: 0,
      };
    };

    const scope1Totals = calculateScopeGasTotals(1);
    const scope2Totals = calculateScopeGasTotals(2);
    const scope3Totals = calculateScopeGasTotals(3);

    const totalEmissions = round2(
      scope1Totals.mtco2e + scope2Totals.mtco2e + scope3Totals.mtco2e
    );

    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentYearStart = new Date(now.getFullYear(), 0, 1);
    const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
    const lastYearEnd = new Date(now.getFullYear(), 0, 1);

    const datedEmissions = processedEmissions.map((emission) => ({
      ...emission,
      record_date: emission.date || emission.created_at || '',
      parsed_date: new Date(emission.date || emission.created_at || ''),
    }));

    const sortedStudentCounts = ((studentCounts || []) as StudentCountRow[])
      .map((entry) => ({
        date: entry.date || '',
        students: toNumber(entry.students),
      }))
      .filter((entry) => entry.date)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const getStudentCountForMonth = (monthStart: Date) => {
      const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getTime();
      const latestForMonth = sortedStudentCounts
        .filter((entry) => new Date(entry.date).getTime() <= monthEnd)
        .at(-1);

      return latestForMonth?.students || sortedStudentCounts.at(-1)?.students || 0;
    };

    const sumEmissionsForDateRange = (from: Date, to?: Date) =>
      datedEmissions
        .filter((entry) => {
          if (Number.isNaN(entry.parsed_date.getTime())) return false;
          return entry.parsed_date >= from && (!to || entry.parsed_date < to);
        })
        .reduce((sum, entry) => sum + entry.total_emissions, 0);

    const currentMonthEmissions = sumEmissionsForDateRange(thisMonth);
    const lastMonthEmissions = sumEmissionsForDateRange(lastMonth, thisMonth);
    const currentYearEmissions = sumEmissionsForDateRange(currentYearStart);
    const lastYearEmissions = sumEmissionsForDateRange(lastYearStart, lastYearEnd);

    const monthOverMonthChange =
      lastMonthEmissions > 0
        ? ((currentMonthEmissions - lastMonthEmissions) / lastMonthEmissions) * 100
        : 0;
    const yearOverYearGrowth =
      lastYearEmissions > 0
        ? ((currentYearEmissions - lastYearEmissions) / lastYearEmissions) * 100
        : 0;

    const activityMap = new Map<string, number>();
    processedEmissions.forEach((entry) => {
      const label = entry.activity_type || entry.category || 'Uncategorized';
      activityMap.set(label, (activityMap.get(label) || 0) + entry.total_emissions);
    });

    const topSources = Array.from(activityMap.entries())
      .map(([activity, emissionsTotal]) => ({
        activity,
        emissions: round2(emissionsTotal),
        percent: totalEmissions > 0 ? round2((emissionsTotal / totalEmissions) * 100) : 0,
      }))
      .sort((a, b) => b.emissions - a.emissions)
      .slice(0, 5);

    const categoryData = Array.from(activityMap.entries())
      .map(([category, emissionsTotal]) => ({
        name: category,
        value: round2(emissionsTotal),
        percentage: totalEmissions > 0 ? round2((emissionsTotal / totalEmissions) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value);

    const forecastResult = buildEmissionForecast(
      datedEmissions.map((entry) => ({
        date: entry.record_date,
        co2_equivalent: entry.total_emissions,
      })),
      {
        historyMonths: 6,
        forecastMonths: 12,
      }
    );

    const forecastChart = [...forecastResult.history, ...forecastResult.forecast].map((point) => ({
      ...point,
      historicalEmissions: point.type === 'historical' ? round2(point.emissions) : null,
      predictedEmissions: point.type === 'predicted' ? round2(point.emissions) : null,
      emissions: round2(point.emissions),
    }));

    const scopeBreakdown = [
      { scope: 1, name: 'Scope 1', emissions: scope1Totals.mtco2e },
      { scope: 2, name: 'Scope 2', emissions: scope2Totals.mtco2e },
      { scope: 3, name: 'Scope 3', emissions: scope3Totals.mtco2e },
    ].map((item) => ({
      ...item,
      percent: totalEmissions > 0 ? round2((item.emissions / totalEmissions) * 100) : 0,
    }));

    const monthlyMap = new Map<string, {
      monthStart: Date;
      total: number;
      scope1: number;
      scope2: number;
      scope3: number;
      count: number;
    }>();

    datedEmissions.forEach((entry) => {
      if (Number.isNaN(entry.parsed_date.getTime())) return;

      const monthStart = new Date(entry.parsed_date.getFullYear(), entry.parsed_date.getMonth(), 1);
      const monthKey = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`;
      const current = monthlyMap.get(monthKey) || {
        monthStart,
        total: 0,
        scope1: 0,
        scope2: 0,
        scope3: 0,
        count: 0,
      };

      current.total += entry.total_emissions;
      current.count += 1;

      if (entry.scope === 1) current.scope1 += entry.total_emissions;
      if (entry.scope === 2) current.scope2 += entry.total_emissions;
      if (entry.scope === 3) current.scope3 += entry.total_emissions;

      monthlyMap.set(monthKey, current);
    });

    const monthlyTrend = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monthKey, data]) => {
        const students = getStudentCountForMonth(data.monthStart);
        const total = round2(data.total);

        return {
          monthKey,
          month: MONTH_LABEL_FORMATTER.format(data.monthStart),
          total,
          scope1: round2(data.scope1),
          scope2: round2(data.scope2),
          scope3: round2(data.scope3),
          count: data.count,
          students,
          intensity: students > 0 ? Number(((data.total / 1000) / students).toFixed(6)) : null,
          average: data.count > 0 ? round2(data.total / data.count) : 0,
        };
      });

    const latestStudentCount = sortedStudentCounts.at(-1)?.students || 0;
    const totalTco2e = totalEmissions / 1000;
    const overallIntensity =
      latestStudentCount > 0 ? Number((totalTco2e / latestStudentCount).toFixed(6)) : 0;

    const scenario = buildScenarioAnalysis({
      forecast: forecastResult.forecast,
      scope1: scope1Totals.mtco2e,
      scope2: scope2Totals.mtco2e,
      scope3: scope3Totals.mtco2e,
      inputs: DEFAULT_SCENARIO_INPUTS,
    });

    console.log('Scope totals:', {
      scope1Emissions: scope1Totals.mtco2e,
      scope2Emissions: scope2Totals.mtco2e,
      scope3Emissions: scope3Totals.mtco2e,
      totalEmissions,
      scope1Gases: {
        co2: scope1Totals.co2_mt,
        ch4: scope1Totals.ch4_mt,
        n2o: scope1Totals.n2o_mt,
      },
      scope2Gases: {
        co2: scope2Totals.co2_mt,
        ch4: scope2Totals.ch4_mt,
        n2o: scope2Totals.n2o_mt,
      },
      scope3Gases: {
        co2: scope3Totals.co2_mt,
        ch4: scope3Totals.ch4_mt,
        n2o: scope3Totals.n2o_mt,
      },
    });

    const reportData = {
      generated_at: new Date().toLocaleString(),
      company_info: {
        name: companyInfo?.company_name || 'N/A',
        description: companyInfo?.company_description || '',
        facility_count: companyInfo?.facility_count || '1',
        facility_address_line_1: companyInfo?.facility_address_line_1 || '',
        facility_address_line_2: companyInfo?.facility_address_line_2 || '',
        facility_postcode: companyInfo?.facility_postcode || '',
        facility_state: companyInfo?.facility_state || '',
        facility_2_address_line_1: companyInfo?.facility_2_address_line_1 || '',
        facility_2_address_line_2: companyInfo?.facility_2_address_line_2 || '',
        facility_2_postcode: companyInfo?.facility_2_postcode || '',
        facility_2_state: companyInfo?.facility_2_state || '',
        consolidation_approach: companyInfo?.consolidation_approach || '',
        business_description: companyInfo?.business_description || '',
        reporting_period: companyInfo?.reporting_period || '',
        base_year: companyInfo?.base_year || new Date().getFullYear(),
        base_year_rationale: companyInfo?.base_year_rationale || '',
      },
      user_name: profile?.full_name || 'User',
      user_job_title: profile?.job_title || '',
      user_email: profile?.email || user.email,
      scope_1_total: scope1Totals.mtco2e,
      scope_2_total: scope2Totals.mtco2e,
      scope_3_total: scope3Totals.mtco2e,
      total_emissions: totalEmissions,
      emissions: {
        scope1: scope1Totals,
        scope2: scope2Totals,
        scope3: scope3Totals,
        total: totalEmissions,
      },
      outlook: {
        current_month_emissions: round2(currentMonthEmissions),
        last_month_emissions: round2(lastMonthEmissions),
        month_over_month_change: round2(monthOverMonthChange),
        year_over_year_growth: round2(yearOverYearGrowth),
        projected_next_month: round2(forecastResult.projectedNextMonth),
        projected_quarter_total: round2(forecastResult.projectedQuarterTotal),
        projected_trend_percent: round2(forecastResult.trendPercent),
        model_confidence: forecastResult.modelConfidence,
        forecast_chart: forecastChart,
        annual_forecast: forecastResult.forecast.map((point) => ({
          ...point,
          emissions: round2(point.emissions),
        })),
        top_sources: topSources,
        scope_breakdown: scopeBreakdown,
        scenario_inputs: DEFAULT_SCENARIO_INPUTS,
        scenario: {
          annualBaselineEmissions: round2(scenario.annualBaselineEmissions),
          annualScenarioEmissions: round2(scenario.annualScenarioEmissions),
          annualAvoidedEmissions: round2(scenario.annualAvoidedEmissions),
          annualReductionPercent: round2(scenario.annualReductionPercent),
          baselineCarbonTaxCost: round2(scenario.baselineCarbonTaxCost),
          scenarioCarbonTaxCost: round2(scenario.scenarioCarbonTaxCost),
          carbonTaxSavings: round2(scenario.carbonTaxSavings),
          chart: scenario.chart.map((point) => ({
            month: point.month,
            baselineEmissions: round2(point.baselineEmissions),
            scenarioEmissions: round2(point.scenarioEmissions),
          })),
          strategies: scenario.strategies.map((strategy) => ({
            ...strategy,
            annualSavings: round2(strategy.annualSavings),
            remainingOpportunity: round2(strategy.remainingOpportunity),
          })),
        },
        analytics: {
          total_entries: processedEmissions.length,
          latest_student_count: latestStudentCount,
          per_student_tco2e: overallIntensity,
          average_per_entry: processedEmissions.length > 0
            ? round2(totalEmissions / processedEmissions.length)
            : 0,
          months_tracked: monthlyTrend.length,
          category_count: categoryData.length,
          highest_category: categoryData[0] || null,
          category_breakdown: categoryData,
          monthly_trend: monthlyTrend,
          intensity_trend: monthlyTrend.filter((point) => point.intensity !== null),
        },
      },
    };

    return NextResponse.json(reportData, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Report generation error:', errorMessage, error);
    return NextResponse.json(
      { error: 'Failed to generate report: ' + errorMessage },
      { status: 500 }
    );
  }
}
