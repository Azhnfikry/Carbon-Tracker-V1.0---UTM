import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

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
      .select('full_name, email')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.warn('Profile fetch warning:', profileError.message);
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
        consolidation_approach: companyInfo?.consolidation_approach || '',
        business_description: companyInfo?.business_description || '',
        reporting_period: companyInfo?.reporting_period || '',
        base_year: companyInfo?.base_year || new Date().getFullYear(),
        base_year_rationale: companyInfo?.base_year_rationale || '',
      },
      user_name: profile?.full_name || 'User',
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
