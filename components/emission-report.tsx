'use client';

import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Area,
  AreaChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  BarChart3,
  Calendar,
  Car,
  CheckCircle2,
  Download,
  Factory,
  Lightbulb,
  Receipt,
  SlidersHorizontal,
  SunMedium,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

type CompanyInfo = {
  name?: string;
  description?: string;
  consolidation_approach?: string;
  business_description?: string;
  reporting_period?: string;
  base_year?: number;
  base_year_rationale?: string;
};

type EmissionByGas = {
  mtco2e: number;
  co2_mt: number;
  ch4_mt: number;
  n2o_mt: number;
  hfcs_mt: number;
  pfcs_mt: number;
  sf6_mt: number;
};

type ForecastChartPoint = {
  monthKey: string;
  label: string;
  emissions: number;
  type: 'historical' | 'predicted';
  historicalEmissions: number | null;
  predictedEmissions: number | null;
};

type OutlookData = {
  current_month_emissions: number;
  last_month_emissions: number;
  month_over_month_change: number;
  year_over_year_growth: number;
  projected_next_month: number;
  projected_quarter_total: number;
  projected_trend_percent: number;
  model_confidence: 'low' | 'medium' | 'high';
  forecast_chart: ForecastChartPoint[];
  top_sources: Array<{ activity: string; emissions: number; percent: number }>;
  scope_breakdown: Array<{ scope: number; name: string; emissions: number; percent: number }>;
  scenario_inputs: {
    solarAdoptionPercent: number;
    evFleetPercent: number;
    supplierSwitchPercent: number;
    carbonTaxRate: number;
  };
  scenario: {
    annualBaselineEmissions: number;
    annualScenarioEmissions: number;
    annualAvoidedEmissions: number;
    annualReductionPercent: number;
    baselineCarbonTaxCost: number;
    scenarioCarbonTaxCost: number;
    carbonTaxSavings: number;
    chart: Array<{ month: string; baselineEmissions: number; scenarioEmissions: number }>;
    strategies: Array<{
      id: string;
      title: string;
      priority: 'high' | 'medium' | 'low';
      annualSavings: number;
      remainingOpportunity: number;
      summary: string;
    }>;
  };
  analytics: {
    total_entries: number;
    latest_student_count: number;
    per_student_tco2e: number;
    average_per_entry: number;
    months_tracked: number;
    category_count: number;
    highest_category: { name: string; value: number; percentage: number } | null;
    category_breakdown: Array<{ name: string; value: number; percentage: number }>;
    monthly_trend: Array<{
      monthKey: string;
      month: string;
      total: number;
      scope1: number;
      scope2: number;
      scope3: number;
      count: number;
      students: number;
      intensity: number | null;
      average: number;
    }>;
    intensity_trend: Array<{
      monthKey: string;
      month: string;
      total: number;
      scope1: number;
      scope2: number;
      scope3: number;
      count: number;
      students: number;
      intensity: number | null;
      average: number;
    }>;
  };
};

type ReportData = {
  generated_at: string;
  company_name?: string;
  inventory_year?: number;
  company_description?: string;
  business_description?: string;
  user_name?: string;
  user_email?: string;
  
  // Simplified totals (for backward compatibility)
  scope_1_total?: number;
  scope_2_total?: number;
  scope_3_total?: number;
  total_emissions?: number;
  
  // New GHG Protocol fields
  company_info?: CompanyInfo;
  emissions?: {
    scope1?: EmissionByGas;
    scope2?: EmissionByGas;
    scope3?: EmissionByGas;
    total?: number;
  };
  outlook?: OutlookData;
};

export function EmissionReport() {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchReportData();
  }, []);

  const fetchReportData = async () => {
    try {
      setError(null);
      setLoading(true);

      console.log('Fetching report data...');
      const response = await fetch('/api/generate-report', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for authentication
      });

      console.log('Response status:', response.status, response.statusText);
      const data = await response.json();
      console.log('Response data:', data);

      if (!response.ok) {
        // Check if error message is in the response
        const errorMsg = data.error || `Failed to fetch report data: ${response.statusText}`;
        console.error('API error:', errorMsg);
        throw new Error(errorMsg);
      }

      console.log('Data received, normalizing...');
      console.log('Company info from API:', data.company_info);
      const normalizedData: ReportData = {
        generated_at: data.generated_at || new Date().toISOString(),
        company_name: data.company_name || data.company_info?.name || 'Not Provided',
        inventory_year: data.inventory_year || data.company_info?.base_year || new Date().getFullYear(),
        company_description: data.company_description || data.company_info?.description || '',
        business_description: data.business_description || data.company_info?.business_description || '',
        user_name: data.generated_by || data.user_name || 'Unknown User',
        user_email: data.report_contact_email || data.user_email || 'N/A',
        
        // Support both old and new formats
        scope_1_total: data.emissions?.scope1?.mtco2e || Number(data.scope_1_total) || 0,
        scope_2_total: data.emissions?.scope2?.mtco2e || Number(data.scope_2_total) || 0,
        scope_3_total: data.emissions?.scope3?.mtco2e || Number(data.scope_3_total) || 0,
        total_emissions: data.emissions?.total || Number(data.total_emissions) || 0,
        
        // Keep new GHG Protocol data and company_info
        company_info: data.company_info,
        emissions: data.emissions || {
          scope1: {
            mtco2e: data.scope_1_total || 0,
            co2_mt: data.scope_1_total || 0,
            ch4_mt: 0,
            n2o_mt: 0,
            hfcs_mt: 0,
            pfcs_mt: 0,
            sf6_mt: 0,
          },
          scope2: {
            mtco2e: data.scope_2_total || 0,
            co2_mt: data.scope_2_total || 0,
            ch4_mt: 0,
            n2o_mt: 0,
            hfcs_mt: 0,
            pfcs_mt: 0,
            sf6_mt: 0,
          },
          scope3: {
            mtco2e: data.scope_3_total || 0,
            co2_mt: data.scope_3_total || 0,
            ch4_mt: 0,
            n2o_mt: 0,
            hfcs_mt: 0,
            pfcs_mt: 0,
            sf6_mt: 0,
          },
          total: data.total_emissions || 0,
        },
        outlook: data.outlook,
      };

      setReportData(normalizedData);
    } catch (err) {
      console.error('Report fetch error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Error loading report';
      console.error('Setting error message:', errorMessage);
      setError(errorMessage);
      setReportData(null);
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async () => {
    if (!reportRef.current) {
      setError('Report not ready');
      return;
    }

    try {
      setDownloading(true);
      setError(null);

      const printContent = reportRef.current.innerHTML;
      const printWindow = window.open('', '', 'width=1000,height=1400');
      
      if (!printWindow) {
        throw new Error('Could not open print window. Check your browser settings.');
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>GHG Emissions Inventory Report</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
              padding: 40px; 
              background: white; 
              color: #1f2937;
              line-height: 1.6;
            }
            .space-y-6 > * + * { margin-top: 1.5rem; }
            .space-y-8 > * + * { margin-top: 2rem; }
            .space-y-4 > * + * { margin-top: 1rem; }
            .space-y-3 > * + * { margin-top: 0.75rem; }
            
            h1 { font-size: 36px; font-weight: bold; margin-bottom: 10px; }
            h2 { font-size: 24px; font-weight: bold; border-bottom: 4px solid #16a34a; padding-bottom: 12px; margin-bottom: 24px; }
            h3 { font-size: 16px; font-weight: 600; }
            
            p { font-size: 14px; }
            .text-xs { font-size: 12px; }
            .text-sm { font-size: 13px; }
            .text-lg { font-size: 16px; }
            .text-2xl { font-size: 20px; }
            .text-5xl { font-size: 48px; }
            
            .font-bold { font-weight: bold; }
            .font-semibold { font-weight: 600; }
            .uppercase { text-transform: uppercase; }
            
            .text-gray-600 { color: #4b5563; }
            .text-gray-400 { color: #9ca3af; }
            .text-gray-500 { color: #6b7280; }
            .text-gray-900 { color: #1f2937; }
            .text-green-700 { color: #15803d; }
            .text-green-400 { color: #4ade80; }
            
            .border-b-4 { border-bottom: 4px solid #16a34a; }
            .border-b-3 { border-bottom: 3px solid #16a34a; }
            .border-b { border-bottom: 1px solid #e5e7eb; }
            .border-t { border-top: 1px solid #e5e7eb; }
            .border-t-2 { border-top: 2px solid #d1d5db; }
            .border-r { border-right: 1px solid #e5e7eb; }
            .border-2 { border: 2px solid #e5e7eb; }
            .border-red-3 { border: 2px solid #fca5a5; }
            .border-amber-3 { border: 2px solid #fcd34d; }
            .border-blue-3 { border: 2px solid #93c5fd; }
            
            .pb-3 { padding-bottom: 12px; }
            .pb-6 { padding-bottom: 24px; }
            .pt-2 { padding-top: 8px; }
            .pt-4 { padding-top: 16px; }
            .pt-6 { padding-top: 24px; }
            .pt-8 { padding-top: 32px; }
            .p-3 { padding: 12px; }
            .p-4 { padding: 16px; }
            .p-5 { padding: 20px; }
            .p-6 { padding: 24px; }
            .p-8 { padding: 32px; }
            
            .mb-2 { margin-bottom: 8px; }
            .mb-3 { margin-bottom: 12px; }
            .mb-4 { margin-bottom: 16px; }
            .mb-6 { margin-bottom: 24px; }
            .mt-2 { margin-top: 8px; }
            .mt-4 { margin-top: 16px; }
            .mt-6 { margin-top: 24px; }
            
            .bg-red-50 { background: #fef2f2; }
            .bg-amber-50 { background: #fffbeb; }
            .bg-blue-50 { background: #eff6ff; }
            .bg-green-50 { background: #f0fdf4; }
            .bg-gray-50 { background: #f9fafb; }
            
            .rounded { border-radius: 4px; }
            .rounded-lg { border-radius: 8px; }
            
            .grid { display: grid; }
            .grid-cols-2 { grid-template-columns: 1fr 1fr; gap: 24px; }
            .grid-cols-3 { grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
            .grid-cols-4 { grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; }
            .gap-3 { gap: 12px; }
            .gap-4 { gap: 16px; }
            .gap-6 { gap: 24px; }
            
            .flex { display: flex; }
            .flex-col { flex-direction: column; }
            .items-start { align-items: flex-start; }
            
            .text-center { text-align: center; }
            .justify-between { justify-content: space-between; }
            .items-center { align-items: center; }
            .items-start { align-items: flex-start; }
            .flex-shrink-0 { flex-shrink: 0; }
            .w-full { width: 100%; }
            .min-h-16 { min-height: 64px; }
            .h-72 { height: 288px; }
            .h-80 { height: 320px; }
            .h-5 { height: 20px; }
            .w-5 { width: 20px; }
            .h-4 { height: 16px; }
            .w-4 { width: 16px; }
            .text-red-600 { color: #dc2626; }
            .text-red-400 { color: #f87171; }
            .text-amber-600 { color: #d97706; }
            .text-amber-400 { color: #f59e0b; }
            .text-blue-600 { color: #2563eb; }
            .text-blue-400 { color: #60a5fa; }
            .text-emerald-700 { color: #047857; }
            .text-emerald-300 { color: #6ee7b7; }
            .text-emerald-900 { color: #064e3b; }
            .text-green-900 { color: #14532d; }
            .text-blue-900 { color: #1e3a8a; }
            .text-amber-900 { color: #78350f; }
            .text-purple-600 { color: #9333ea; }
            .bg-white { background: #ffffff; }
            .bg-slate-50 { background: #f8fafc; }
            .bg-slate-900 { background: #0f172a; }
            .bg-emerald-50 { background: #ecfdf5; }
            .bg-green-50 { background: #f0fdf4; }
            .bg-blue-50 { background: #eff6ff; }
            .bg-amber-50 { background: #fffbeb; }
            .border-gray-200 { border-color: #e5e7eb; }
            .border-slate-200 { border-color: #e2e8f0; }
            .border-slate-700 { border-color: #334155; }
            .border-emerald-200 { border-color: #a7f3d0; }
            .border-green-200 { border-color: #bbf7d0; }
            .border-blue-200 { border-color: #bfdbfe; }
            .border-amber-200 { border-color: #fde68a; }
            .border-l-4 { border-left-width: 4px; }
            .border-red-600 { border-color: #dc2626; }
            .border-amber-600 { border-color: #d97706; }
            .border-blue-600 { border-color: #2563eb; }
            .grid-cols-1 { grid-template-columns: 1fr; gap: 16px; }
            .grid-cols-5 { grid-template-columns: repeat(5, 1fr); gap: 12px; }
            .mt-0\.5 { margin-top: 2px; }
            .mt-1 { margin-top: 4px; }
            .rounded-full { border-radius: 9999px; }
            .italic { font-style: italic; }
            
            .bg-gradient-to-r { background: linear-gradient(to right, #f0fdf4, #dbeafe); }
            
            @media print {
              body { padding: 20px; }
              .page-break { page-break-after: always; }
            }
          </style>
        </head>
        <body>
          ${printContent}
          <script>
            setTimeout(() => {
              window.print();
            }, 100);
          </script>
        </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error downloading PDF');
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading report...</p>
        </div>
      </div>
    );
  }

  if (error && !reportData) {
    return (
      <div className="space-y-4">
        <Alert className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800 dark:text-red-200">{error}</AlertDescription>
        </Alert>
        <div className="bg-gray-50 dark:bg-slate-900 p-4 rounded-lg text-sm text-gray-600 dark:text-gray-400">
          <p className="font-semibold mb-2">Troubleshooting:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Make sure you are logged in</li>
            <li>Have you added any emissions entries?</li>
            <li>Check browser console for more details (F12 → Console tab)</li>
            <li>Try refreshing the page (F5)</li>
          </ul>
        </div>
      </div>
    );
  }

  if (!reportData) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No report data available. Please add company info and emission entries first, then refresh this page.
        </AlertDescription>
      </Alert>
    );
  }

  // Helper function to format numbers
  const formatNumber = (value: number | undefined, decimals: number = 2): string => {
    if (!value && value !== 0) return 'N/A';
    return parseFloat(String(value)).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatCompactNumber = (value: number | undefined): string => {
    if (!value && value !== 0) return 'N/A';
    return Number(value).toLocaleString('en-US', {
      maximumFractionDigits: 0,
    });
  };

  const outlook = reportData.outlook;
  const confidenceLabel =
    outlook?.model_confidence === 'high'
      ? 'High confidence'
      : outlook?.model_confidence === 'medium'
        ? 'Moderate confidence'
        : 'Early estimate';

  const scopeColors: Record<number, string> = {
    1: '#dc2626',
    2: '#d97706',
    3: '#2563eb',
  };

  const priorityStyles = {
    high: 'border-red-600 bg-red-50 text-red-800 dark:bg-red-950/20 dark:text-red-200',
    medium: 'border-amber-600 bg-amber-50 text-amber-800 dark:bg-amber-950/20 dark:text-amber-200',
    low: 'border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-950/20 dark:text-blue-200',
  } as const;

  const scenarioControls = outlook
    ? [
        {
          label: 'Solar adoption',
          icon: SunMedium,
          value: `${outlook.scenario_inputs.solarAdoptionPercent}%`,
        },
        {
          label: 'EV fleet transition',
          icon: Car,
          value: `${outlook.scenario_inputs.evFleetPercent}%`,
        },
        {
          label: 'Supplier switch',
          icon: Factory,
          value: `${outlook.scenario_inputs.supplierSwitchPercent}%`,
        },
        {
          label: 'Carbon tax',
          icon: Receipt,
          value: `RM ${outlook.scenario_inputs.carbonTaxRate}/tCO2e`,
        },
      ]
    : [];

  const topScenarioStrategy = outlook?.scenario.strategies[0];
  const nextBestStrategy = outlook?.scenario.strategies[1];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">GHG Emissions Inventory Report</h2>
          <p className="text-muted-foreground text-sm">Scope 1, 2 & 3 Professional Report</p>
        </div>
        <Button
          onClick={downloadPDF}
          disabled={downloading}
          className="bg-green-600 hover:bg-green-700 flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          {downloading ? 'Generating...' : 'Download PDF'}
        </Button>
      </div>

      {/* Printable Report */}
      <div ref={reportRef} className="bg-white dark:bg-slate-950 p-8 rounded-lg border border-gray-200 dark:border-slate-800 space-y-8">
        {/* Header */}
        <div className="border-b-4 border-green-600 pb-6">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">GHG EMISSIONS INVENTORY REPORT</h1>
          <div className="grid grid-cols-2 gap-6 text-sm text-gray-600 dark:text-gray-400 mt-4">
            <div>
              <p className="text-xs uppercase font-semibold">Generated</p>
              <p>{new Date(reportData.generated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            <div>
              <p className="text-xs uppercase font-semibold">Inventory Year</p>
              <p>{reportData.inventory_year}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs uppercase font-semibold">Prepared By</p>
              <p>{reportData.user_name}</p>
              <p className="text-xs">{reportData.user_email}</p>
            </div>
          </div>
        </div>

        {/* SECTION 1: Company Information */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white border-b-3 border-green-600 pb-3 mb-6">
            1. COMPANY INFORMATION
          </h2>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase">Company Name</p>
              <p className="text-lg text-gray-900 dark:text-white">{reportData.company_name || 'Not provided'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase">Contact</p>
              <p className="text-lg text-gray-900 dark:text-white">{reportData.user_email}</p>
            </div>
          </div>

          {reportData.company_description && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase">Company Description</p>
              <p className="text-gray-700 dark:text-gray-300 mt-2">{reportData.company_description}</p>
            </div>
          )}

          {reportData.business_description && (
            <div className="mb-6">
              <p className="text-xs font-semibold text-gray-500 uppercase">Business Activities</p>
              <p className="text-gray-700 dark:text-gray-300 mt-2">{reportData.business_description}</p>
            </div>
          )}

          {/* ORGANIZATIONAL BOUNDARY SUB-SECTION */}
          <div className="bg-gray-50 dark:bg-slate-900 p-4 rounded-lg border border-gray-200 dark:border-slate-700 mb-6">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase mb-4 border-b border-gray-300 pb-2">Organizational Boundary Approach</h3>
            
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 bg-white dark:bg-slate-800 rounded border border-gray-200 dark:border-slate-600">
                <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-semibold">Equity Share</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                  {(() => {
                    try {
                      const boundaries = JSON.parse(reportData.company_info?.consolidation_approach || '[]');
                      return Array.isArray(boundaries) && boundaries.includes('equity') ? '✓' : '—';
                    } catch {
                      return '—';
                    }
                  })()}
                </p>
              </div>
              <div className="text-center p-3 bg-white dark:bg-slate-800 rounded border border-gray-200 dark:border-slate-600">
                <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-semibold">Financial Control</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                  {(() => {
                    try {
                      const boundaries = JSON.parse(reportData.company_info?.consolidation_approach || '[]');
                      return Array.isArray(boundaries) && boundaries.includes('financial') ? '✓' : '—';
                    } catch {
                      return '—';
                    }
                  })()}
                </p>
              </div>
              <div className="text-center p-3 bg-white dark:bg-slate-800 rounded border border-gray-200 dark:border-slate-600">
                <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-semibold">Operational Control</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                  {(() => {
                    try {
                      const boundaries = JSON.parse(reportData.company_info?.consolidation_approach || '[]');
                      return Array.isArray(boundaries) && boundaries.includes('operational') ? '✓' : '—';
                    } catch {
                      return '—';
                    }
                  })()}
                </p>
              </div>
            </div>

            {reportData.company_info?.consolidation_approach && (
              <div className="p-3 bg-white dark:bg-slate-800 rounded border border-gray-200 dark:border-slate-600">
                <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-semibold mb-2">Applied Boundary Approaches</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {(() => {
                    try {
                      const boundaries = JSON.parse(reportData.company_info.consolidation_approach || '[]');
                      if (!Array.isArray(boundaries) || boundaries.length === 0) return 'Not specified';
                      const labels: Record<string, string> = {
                        equity: 'Equity Share',
                        financial: 'Financial Control',
                        operational: 'Operational Control'
                      };
                      return boundaries.map(b => labels[b] || b).join(', ');
                    } catch {
                      return reportData.company_info.consolidation_approach;
                    }
                  })()}
                </p>
              </div>
            )}
          </div>

          {/* OPERATIONAL BOUNDARIES SUB-SECTION */}
          <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-700 mb-6">
            <h3 className="text-sm font-bold text-blue-900 dark:text-blue-200 uppercase mb-4 border-b border-blue-300 pb-2">Scope & Emission Coverage</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-white dark:bg-slate-800 rounded border border-blue-200 dark:border-blue-600">
                <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-semibold">Scope 3 Included</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white mt-2">
                  {reportData.company_info?.consolidation_approach?.includes('scope3') || 
                   (reportData.scope_3_total && reportData.scope_3_total > 0) ? 'Yes' : 'No'}
                </p>
              </div>
              <div className="p-3 bg-white dark:bg-slate-800 rounded border border-blue-200 dark:border-blue-600">
                <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-semibold">Reporting Period</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white mt-2">
                  {reportData.company_info?.reporting_period || `Year ${reportData.inventory_year}`}
                </p>
              </div>
            </div>

            {reportData.company_info?.business_description && (
              <div className="mt-4 p-3 bg-white dark:bg-slate-800 rounded border border-blue-200 dark:border-blue-600">
                <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-semibold mb-2">Scope Coverage</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">Includes all applicable Scopes 1, 2, and 3 emissions as defined by GHG Protocol standards.</p>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 2: Emissions Summary - Main */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white border-b-3 border-green-600 pb-3 mb-6">
            2. GHG EMISSIONS SUMMARY
          </h2>

          {/* Total Emissions Headline */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-2 border-green-600 rounded-lg p-6 mb-6">
            <p className="text-sm font-semibold text-gray-600 dark:text-gray-300 uppercase">Total GHG Emissions (All Scopes)</p>
            <p className="text-5xl font-bold text-green-700 dark:text-green-400 mt-2">{formatNumber(reportData.total_emissions)}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">metric tons CO₂e</p>
          </div>

          {/* Three Scopes Grid */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {/* Scope 1 */}
            <div className="border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/20 rounded-lg p-5">
              <p className="text-sm font-bold text-red-700 dark:text-red-400 uppercase mb-3">Scope 1</p>
              <p className="text-sm text-red-600 dark:text-red-300 mb-4 font-semibold">Direct Emissions</p>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Total</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{formatNumber(reportData.scope_1_total)}</p>
                </div>
                {reportData.emissions?.scope1 && reportData.emissions.scope1.co2_mt > 0 && (
                  <div className="pt-2 border-t border-red-200">
                    <p className="text-xs text-gray-500 dark:text-gray-400">CO₂</p>
                    <p className="text-sm text-red-600 dark:text-red-400">{formatNumber(reportData.emissions.scope1.co2_mt)} MT</p>
                  </div>
                )}
              </div>
            </div>

            {/* Scope 2 */}
            <div className="border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-5">
              <p className="text-sm font-bold text-amber-700 dark:text-amber-400 uppercase mb-3">Scope 2</p>
              <p className="text-sm text-amber-600 dark:text-amber-300 mb-4 font-semibold">Indirect Energy</p>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Total</p>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{formatNumber(reportData.scope_2_total)}</p>
                </div>
                {reportData.emissions?.scope2 && reportData.emissions.scope2.co2_mt > 0 && (
                  <div className="pt-2 border-t border-amber-200">
                    <p className="text-xs text-gray-500 dark:text-gray-400">CO₂</p>
                    <p className="text-sm text-amber-600 dark:text-amber-400">{formatNumber(reportData.emissions.scope2.co2_mt)} MT</p>
                  </div>
                )}
              </div>
            </div>

            {/* Scope 3 */}
            <div className="border-2 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/20 rounded-lg p-5">
              <p className="text-sm font-bold text-blue-700 dark:text-blue-400 uppercase mb-3">Scope 3</p>
              <p className="text-sm text-blue-600 dark:text-blue-300 mb-4 font-semibold">Other Indirect</p>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Total</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatNumber(reportData.scope_3_total)}</p>
                </div>
                {reportData.emissions?.scope3 && reportData.emissions.scope3.co2_mt > 0 && (
                  <div className="pt-2 border-t border-blue-200">
                    <p className="text-xs text-gray-500 dark:text-gray-400">CO₂</p>
                    <p className="text-sm text-blue-600 dark:text-blue-400">{formatNumber(reportData.emissions.scope3.co2_mt)} MT</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Scope Definitions */}
          <div className="bg-gray-50 dark:bg-slate-900 p-4 rounded-lg text-xs text-gray-600 dark:text-gray-400 space-y-2">
            <p><strong>Scope 1 - Direct Emissions:</strong> GHG emissions from sources owned or controlled by the company (e.g., fuel combustion, process emissions).</p>
            <p><strong>Scope 2 - Indirect Energy Emissions:</strong> GHG emissions from the generation of purchased electricity, steam, heating, and cooling.</p>
            <p><strong>Scope 3 - Other Indirect Emissions:</strong> All other indirect emissions from company's value chain not covered in Scopes 1 or 2.</p>
          </div>
        </div>

        {/* SECTION 3: Gas Breakdown */}
        {reportData.emissions && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white border-b-3 border-green-600 pb-3 mb-6">
              3. GHG EMISSIONS BY GAS TYPE
            </h2>

            <div className="space-y-4">
              {/* Scope 1 Gases */}
              <div>
                <p className="font-semibold text-gray-900 dark:text-white mb-3">Scope 1 - Direct Emissions</p>
                <div className="grid grid-cols-4 gap-3 text-sm">
                  <div className="bg-gray-50 dark:bg-slate-900 p-3 rounded">
                    <p className="text-xs text-gray-600 dark:text-gray-400">CO₂</p>
                    <p className="font-bold text-gray-900 dark:text-white">{formatNumber(reportData.emissions.scope1?.co2_mt || 0)}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-slate-900 p-3 rounded">
                    <p className="text-xs text-gray-600 dark:text-gray-400">CH₄</p>
                    <p className="font-bold text-gray-900 dark:text-white">{formatNumber(reportData.emissions.scope1?.ch4_mt || 0)}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-slate-900 p-3 rounded">
                    <p className="text-xs text-gray-600 dark:text-gray-400">N₂O</p>
                    <p className="font-bold text-gray-900 dark:text-white">{formatNumber(reportData.emissions.scope1?.n2o_mt || 0)}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-slate-900 p-3 rounded">
                    <p className="text-xs text-gray-600 dark:text-gray-400">Total CO₂e</p>
                    <p className="font-bold text-gray-900 dark:text-white">{formatNumber(reportData.emissions.scope1?.mtco2e || 0)}</p>
                  </div>
                </div>
              </div>

              {/* Scope 2 Gases */}
              <div>
                <p className="font-semibold text-gray-900 dark:text-white mb-3">Scope 2 - Indirect Energy</p>
                <div className="grid grid-cols-4 gap-3 text-sm">
                  <div className="bg-gray-50 dark:bg-slate-900 p-3 rounded">
                    <p className="text-xs text-gray-600 dark:text-gray-400">CO₂</p>
                    <p className="font-bold text-gray-900 dark:text-white">{formatNumber(reportData.emissions.scope2?.co2_mt || 0)}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-slate-900 p-3 rounded">
                    <p className="text-xs text-gray-600 dark:text-gray-400">CH₄</p>
                    <p className="font-bold text-gray-900 dark:text-white">{formatNumber(reportData.emissions.scope2?.ch4_mt || 0)}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-slate-900 p-3 rounded">
                    <p className="text-xs text-gray-600 dark:text-gray-400">N₂O</p>
                    <p className="font-bold text-gray-900 dark:text-white">{formatNumber(reportData.emissions.scope2?.n2o_mt || 0)}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-slate-900 p-3 rounded">
                    <p className="text-xs text-gray-600 dark:text-gray-400">Total CO₂e</p>
                    <p className="font-bold text-gray-900 dark:text-white">{formatNumber(reportData.emissions.scope2?.mtco2e || 0)}</p>
                  </div>
                </div>
              </div>

              {/* Scope 3 Gases */}
              <div>
                <p className="font-semibold text-gray-900 dark:text-white mb-3">Scope 3 - Other Indirect</p>
                <div className="grid grid-cols-4 gap-3 text-sm">
                  <div className="bg-gray-50 dark:bg-slate-900 p-3 rounded">
                    <p className="text-xs text-gray-600 dark:text-gray-400">CO₂</p>
                    <p className="font-bold text-gray-900 dark:text-white">{formatNumber(reportData.emissions.scope3?.co2_mt || 0)}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-slate-900 p-3 rounded">
                    <p className="text-xs text-gray-600 dark:text-gray-400">CH₄</p>
                    <p className="font-bold text-gray-900 dark:text-white">{formatNumber(reportData.emissions.scope3?.ch4_mt || 0)}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-slate-900 p-3 rounded">
                    <p className="text-xs text-gray-600 dark:text-gray-400">N₂O</p>
                    <p className="font-bold text-gray-900 dark:text-white">{formatNumber(reportData.emissions.scope3?.n2o_mt || 0)}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-slate-900 p-3 rounded">
                    <p className="text-xs text-gray-600 dark:text-gray-400">Total CO₂e</p>
                    <p className="font-bold text-gray-900 dark:text-white">{formatNumber(reportData.emissions.scope3?.mtco2e || 0)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 4: Interactive Outlook & Analytics */}
        {outlook && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white border-b-3 border-green-600 pb-3 mb-6">
              4. EMISSIONS OUTLOOK & ANALYTICAL DASHBOARD
            </h2>

            <div className="grid grid-cols-4 gap-3 mb-6">
              <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
                <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-semibold">Next Month Forecast</p>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-2">
                  {formatCompactNumber(outlook.projected_next_month)}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">kg CO2e</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-semibold">Next 3 Months</p>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-300 mt-2">
                  {formatCompactNumber(outlook.projected_quarter_total)}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">kg CO2e forecast</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
                <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-semibold">Forecast Signal</p>
                <div className="flex items-center gap-2 mt-2">
                  {outlook.projected_trend_percent <= 0 ? (
                    <TrendingDown className="h-5 w-5 text-green-600" />
                  ) : (
                    <TrendingUp className="h-5 w-5 text-red-600" />
                  )}
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {Math.abs(outlook.projected_trend_percent).toFixed(1)}%
                  </p>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{confidenceLabel}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-semibold">Year-over-Year</p>
                <div className="flex items-center gap-2 mt-2">
                  {outlook.year_over_year_growth <= 0 ? (
                    <TrendingDown className="h-5 w-5 text-green-600" />
                  ) : (
                    <TrendingUp className="h-5 w-5 text-red-600" />
                  )}
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {Math.abs(outlook.year_over_year_growth).toFixed(1)}%
                  </p>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {outlook.year_over_year_growth <= 0 ? 'Improvement' : 'Growth'}
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <section className="rounded-lg border border-gray-200 dark:border-slate-700 p-4">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase text-gray-900 dark:text-white">
                  <TrendingUp className="h-4 w-4" />
                  Forecast
                </h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={outlook.forecast_chart} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" />
                      <YAxis tickFormatter={(value) => `${Number(value).toFixed(0)}`} />
                      <Tooltip formatter={(value) => value === null ? '' : `${Number(value).toFixed(0)} kg CO2e`} />
                      <Line
                        type="monotone"
                        dataKey="historicalEmissions"
                        name="Historical"
                        stroke="#0f766e"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        connectNulls={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="predictedEmissions"
                        name="12-month forecast"
                        stroke="#ea580c"
                        strokeWidth={3}
                        strokeDasharray="6 6"
                        dot={{ r: 4 }}
                        connectNulls={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="space-y-4 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase text-gray-900 dark:text-white">
                  <SlidersHorizontal className="h-4 w-4" />
                  Scenario Engine
                </h3>
                <div className="grid grid-cols-4 gap-3">
                  {scenarioControls.map((control) => {
                    const Icon = control.icon;

                    return (
                      <div key={control.label} className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 p-3">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-slate-700 dark:text-slate-300" />
                          <p className="text-xs font-semibold uppercase text-gray-600 dark:text-gray-400">{control.label}</p>
                        </div>
                        <p className="mt-2 text-lg font-bold text-gray-900 dark:text-white">{control.value}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-4 gap-3">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-700 dark:bg-emerald-950/20">
                    <p className="text-xs font-semibold uppercase text-gray-600 dark:text-gray-400">Baseline 12 Months</p>
                    <p className="mt-2 text-2xl font-bold text-emerald-900 dark:text-emerald-200">
                      {formatCompactNumber(outlook.scenario.annualBaselineEmissions)}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">kg CO2e</p>
                  </div>
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-700 dark:bg-green-950/20">
                    <p className="text-xs font-semibold uppercase text-gray-600 dark:text-gray-400">Scenario Outcome</p>
                    <p className="mt-2 text-2xl font-bold text-green-900 dark:text-green-200">
                      {formatCompactNumber(outlook.scenario.annualScenarioEmissions)}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">kg CO2e</p>
                  </div>
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-700 dark:bg-blue-950/20">
                    <p className="text-xs font-semibold uppercase text-gray-600 dark:text-gray-400">Avoided Emissions</p>
                    <p className="mt-2 text-2xl font-bold text-blue-900 dark:text-blue-200">
                      {formatCompactNumber(outlook.scenario.annualAvoidedEmissions)}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {outlook.scenario.annualReductionPercent.toFixed(1)}% reduction
                    </p>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/20">
                    <p className="text-xs font-semibold uppercase text-gray-600 dark:text-gray-400">Tax Exposure</p>
                    <p className="mt-2 text-2xl font-bold text-amber-900 dark:text-amber-200">
                      RM {formatCompactNumber(outlook.scenario.scenarioCarbonTaxCost)}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      RM {formatCompactNumber(outlook.scenario.carbonTaxSavings)} avoided
                    </p>
                  </div>
                </div>

                <div className="h-80 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={outlook.scenario.chart} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(value) => `${Number(value).toFixed(0)}`} />
                      <Tooltip formatter={(value) => `${Number(value).toFixed(0)} kg CO2e`} />
                      <Legend />
                      <Line type="monotone" dataKey="baselineEmissions" name="Baseline forecast" stroke="#64748b" strokeWidth={3} dot={false} />
                      <Line type="monotone" dataKey="scenarioEmissions" name="Scenario outcome" stroke="#16a34a" strokeWidth={3} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <h3 className="mb-3 text-sm font-bold uppercase text-gray-900 dark:text-white">Scenario-Based Reduction Strategy</h3>
                    <div className="space-y-3">
                      {outlook.scenario.strategies.map((strategy) => (
                        <div key={strategy.id} className={`rounded-lg border-l-4 p-4 ${priorityStyles[strategy.priority]}`}>
                          <div className="mb-2 flex items-start justify-between gap-4">
                            <div>
                              <p className="text-sm font-semibold">{strategy.title}</p>
                              <p className="mt-1 text-xs text-gray-700 dark:text-gray-300">{strategy.summary}</p>
                            </div>
                            <span className="rounded bg-white/70 px-2 py-1 text-xs font-bold dark:bg-slate-900/70">
                              {strategy.priority.toUpperCase()}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                              <CheckCircle2 className="h-4 w-4" />
                              <span className="text-sm font-medium">Current gain: {formatCompactNumber(strategy.annualSavings)} kg CO2e</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                              <Target className="h-4 w-4" />
                              <span className="text-sm font-medium">Remaining opportunity: {formatCompactNumber(strategy.remainingOpportunity)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-3 text-sm font-bold uppercase text-gray-900 dark:text-white">Decision Support</h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="flex items-start gap-3 rounded-lg bg-green-50 p-3 dark:bg-green-950/20">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">Best lever right now</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {topScenarioStrategy?.title || 'Review scope mix'} has the biggest remaining impact under this scenario.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 rounded-lg bg-blue-50 p-3 dark:bg-blue-950/20">
                        <Zap className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">Next best follow-up</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {nextBestStrategy
                              ? `${nextBestStrategy.title} is the next strongest move.`
                              : 'Add more data to rank follow-up actions.'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 rounded-lg bg-amber-50 p-3 dark:bg-amber-950/20">
                        <TrendingDown className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">Financial resilience</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            Modeled carbon tax exposure is RM {formatCompactNumber(outlook.scenario.scenarioCarbonTaxCost)} over 12 months.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-gray-200 dark:border-slate-700 p-4">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase text-gray-900 dark:text-white">
                  <Target className="h-4 w-4" />
                  Top Emission Sources
                </h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={outlook.top_sources} layout="vertical" margin={{ top: 8, right: 16, left: 48, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tickFormatter={(value) => `${Number(value).toFixed(0)}`} />
                        <YAxis type="category" dataKey="activity" width={120} />
                        <Tooltip formatter={(value) => `${Number(value).toFixed(0)} kg CO2e`} />
                        <Bar dataKey="emissions" name="Emissions" fill="#dc2626" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-3">
                    {outlook.top_sources.map((source) => (
                      <div key={source.activity} className="rounded border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{source.activity}</p>
                          <p className="text-sm font-bold text-red-600 dark:text-red-400">{source.percent.toFixed(1)}%</p>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {formatCompactNumber(source.emissions)} kg CO2e of total emissions
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-gray-200 dark:border-slate-700 p-4">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase text-gray-900 dark:text-white">
                  <BarChart3 className="h-4 w-4" />
                  Scope Emissions
                </h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={outlook.scope_breakdown}
                          dataKey="emissions"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={110}
                          label={({ name, percent }) => `${name}: ${Number(percent).toFixed(1)}%`}
                        >
                          {outlook.scope_breakdown.map((scope) => (
                            <Cell key={scope.scope} fill={scopeColors[scope.scope] || '#64748b'} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => `${Number(value).toFixed(0)} kg CO2e`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-4">
                    {outlook.scope_breakdown.map((scope) => (
                      <div key={scope.scope}>
                        <div className="flex justify-between mb-2">
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">{scope.name}</span>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {formatCompactNumber(scope.emissions)} kg CO2e ({scope.percent.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-slate-800">
                          <div
                            className="h-2 rounded-full"
                            style={{
                              width: `${scope.percent}%`,
                              backgroundColor: scopeColors[scope.scope] || '#64748b',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="space-y-4 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
                <div>
                  <h3 className="mb-3 text-sm font-bold uppercase text-gray-900 dark:text-white">Analytics & Insights</h3>
                  <div className="grid grid-cols-5 gap-3">
                    <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase text-gray-600 dark:text-gray-400">Total Entries</p>
                        <BarChart3 className="h-4 w-4 text-emerald-600" />
                      </div>
                      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{outlook.analytics.total_entries}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">{outlook.analytics.category_count} categories</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase text-gray-600 dark:text-gray-400">Per Student</p>
                        <Users className="h-4 w-4 text-rose-600" />
                      </div>
                      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{outlook.analytics.per_student_tco2e.toFixed(4)}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">tCO2e/student</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase text-gray-600 dark:text-gray-400">Students</p>
                        <Users className="h-4 w-4 text-blue-600" />
                      </div>
                      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{formatCompactNumber(outlook.analytics.latest_student_count)}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">latest count</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase text-gray-600 dark:text-gray-400">Avg Entry</p>
                        <Calendar className="h-4 w-4 text-amber-600" />
                      </div>
                      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{formatCompactNumber(outlook.analytics.average_per_entry)}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">kg CO2e</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase text-gray-600 dark:text-gray-400">Highest Category</p>
                        <Lightbulb className="h-4 w-4 text-purple-600" />
                      </div>
                      <p className="mt-2 text-lg font-bold text-gray-900 dark:text-white">{outlook.analytics.highest_category?.name || 'N/A'}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {outlook.analytics.highest_category?.percentage.toFixed(1) || '0.0'}% of total
                      </p>
                    </div>
                  </div>
                </div>

                <div className="h-80 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={outlook.analytics.monthly_trend} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(value) => `${Number(value).toFixed(0)}`} />
                      <Tooltip formatter={(value) => `${Number(value).toFixed(0)} kg CO2e`} />
                      <Legend />
                      <Area type="monotone" dataKey="scope1" name="Scope 1" stackId="1" stroke="#dc2626" fill="#fecaca" />
                      <Area type="monotone" dataKey="scope2" name="Scope 2" stackId="1" stroke="#d97706" fill="#fde68a" />
                      <Area type="monotone" dataKey="scope3" name="Scope 3" stackId="1" stroke="#2563eb" fill="#bfdbfe" />
                      <Line type="monotone" dataKey="total" name="Total Emissions" stroke="#0f172a" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="h-72 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={outlook.analytics.intensity_trend} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="month" />
                        <YAxis tickFormatter={(value) => `${Number(value).toFixed(4)}`} />
                        <Tooltip formatter={(value) => `${Number(value).toFixed(6)} tCO2e/student`} />
                        <Line type="monotone" dataKey="intensity" name="tCO2e/student" stroke="#14b8a6" strokeWidth={3} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="h-72 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={outlook.analytics.category_breakdown.slice(0, 8)} margin={{ top: 8, right: 16, left: 4, bottom: 48 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="name" angle={-30} textAnchor="end" interval={0} height={72} />
                        <YAxis tickFormatter={(value) => `${Number(value).toFixed(0)}`} />
                        <Tooltip formatter={(value) => `${Number(value).toFixed(0)} kg CO2e`} />
                        <Bar dataKey="value" name="Emissions" fill="#0f766e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* SECTION 5: Calculation Methodology */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white border-b-3 border-green-600 pb-3 mb-6">
            5. METHODOLOGY & STANDARDS
          </h2>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Standards Applied</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">GHG Protocol Corporate Accounting and Reporting Standard</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Emission Factors</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">IPCC AR6, EPA Guidelines, DEFRA/BEIS Data</p>
            </div>
            <div className="col-span-2">
              <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Calculation Approach</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Emissions = Activity Data × Emission Factor</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t-2 border-gray-300 pt-6 text-xs text-gray-600 dark:text-gray-400 space-y-4">
          <div className="grid grid-cols-3 gap-6 text-left">
            <div>
              <p className="text-xs font-semibold uppercase text-gray-500">Prepared By</p>
              <div className="min-h-16 border-b border-gray-300 pt-8"></div>
              <p className="mt-2">Name / Signature / Date</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-gray-500">Reviewed By</p>
              <div className="min-h-16 border-b border-gray-300 pt-8"></div>
              <p className="mt-2">Name / Signature / Date</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-gray-500">Approved By</p>
              <div className="min-h-16 border-b border-gray-300 pt-8"></div>
              <p className="mt-2">Name / Signature / Date</p>
            </div>
          </div>
          <p className="text-center"><strong>Report Prepared:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          <p className="text-center"><strong>AI Drafting Disclosure:</strong> This report was drafted by the software with AI assistance and should be reviewed before use.</p>
          <p className="text-center">© {new Date().getFullYear()} Carbon Calculator - GHG Emissions Inventory Report</p>
          <p className="text-center italic">This report is based on data provided by the user and calculated using industry-standard emission factors.</p>
        </div>
      </div>
    </div>
  );
}
