'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, Eye, FileCheck2, Save, Sparkles } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { BoundaryResult } from '@/lib/report/build-context';
import type { NarrativeKey, NarrativeState, RecommendationRow, ReportSettings, TextSettingKey } from '@/lib/report/types';

type Summary = {
  total_tco2e: string;
  scope1_tco2e: string;
  scope2_tco2e: string;
  scope3_tco2e: string;
  outside_scopes_tco2e: string;
  excluded: string[];
};

type ReportResponse = {
  settings: ReportSettings;
  narrative: NarrativeState;
  blockers: string[];
  warnings: string[];
  summary: Summary;
  boundary: BoundaryResult[];
};

const SETTING_GROUPS: Array<{ title: string; fields: Array<{ key: TextSettingKey; label: string; long?: boolean; hint?: string }> }> = [
  {
    title: 'Cover and document control',
    fields: [
      { key: 'organisation_name', label: 'Organisation name' },
      { key: 'campus_name', label: 'Campus name' },
      { key: 'campus_address', label: 'Campus address' },
      { key: 'contact_email', label: 'Contact email' },
      { key: 'report_version', label: 'Report version' },
      { key: 'report_date', label: 'Report date' },
      { key: 'prepared_by', label: 'Prepared by (name and position)' },
      { key: 'prepared_by_org', label: 'Prepared by (organisation)' },
      { key: 'reviewed_by', label: 'Reviewed by' },
      { key: 'approved_by', label: 'Approved by' },
      {
        key: 'assurance_status',
        label: 'Assurance status',
        hint: 'Internal review only – not externally verified / Limited assurance by … / Reasonable assurance by …',
      },
      { key: 'platform_name', label: 'Platform name' },
      { key: 'assurance_statement', label: 'Assurance statement (Section 9)', long: true },
    ],
  },
  {
    title: 'Organisational profile (context only, not used in calculations)',
    fields: [
      { key: 'gross_floor_area_m2', label: 'Gross floor area (m²)' },
      { key: 'staff_count', label: 'Staff' },
      { key: 'student_count', label: 'Students' },
      { key: 'organisation_profile', label: 'Organisational profile', long: true, hint: '2–3 short paragraphs: institution, campus, main activities and energy drivers.' },
    ],
  },
  {
    title: 'Boundaries, base year and assumptions',
    fields: [
      { key: 'consolidation_approach', label: 'Consolidation approach', hint: 'Operational control / Financial control / Equity share' },
      { key: 'sites_included', label: 'Sites included' },
      { key: 'base_year', label: 'Base year' },
      { key: 'recalc_threshold_pct', label: 'Base-year recalculation threshold (%)' },
      { key: 'sites_excluded_statement', label: 'Sites excluded statement', long: true },
      { key: 'base_year_rationale', label: 'Base year rationale', long: true },
      { key: 'assumptions', label: 'Key assumptions (Section 4.4)', long: true },
    ],
  },
];

const NARRATIVE_FIELDS: Array<{ key: Exclude<NarrativeKey, 'recommendations'>; label: string }> = [
  { key: 'exec_summary_paragraph', label: 'Executive summary – key findings' },
  { key: 'exec_recommendations_paragraph', label: 'Executive summary – priority recommendations' },
  { key: 'hotspot_analysis', label: 'Section 6 – Emission hotspots' },
  { key: 'improvement_plan', label: 'Section 7.2 – Improvement plan' },
];

const RECOMMENDATION_COLUMNS: Array<{ key: keyof RecommendationRow; label: string }> = [
  { key: 'action', label: 'Action' },
  { key: 'source', label: 'Source addressed' },
  { key: 'source_tco2e', label: 'Source tCO2e' },
  { key: 'effort', label: 'Effort' },
  { key: 'timeframe', label: 'Timeframe' },
];

async function readError(response: Response) {
  const data = await response.json().catch(() => ({}));
  return [data.error || `Request failed (${response.status})`, ...(data.blockers || [])].join('\n');
}

// GHG inventory report (UTM template): MANUAL settings, AI drafts with review, preview and PDF export.
export function InventoryReportPanel({ year }: { year: string | null }) {
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [settings, setSettings] = useState<ReportSettings | null>(null);
  const [narrative, setNarrative] = useState<NarrativeState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!year) return;
    let cancelled = false;
    setReport(null);
    setError(null);
    fetch(`/api/report?year=${year}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return response.json() as Promise<ReportResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        setReport(data);
        setSettings(data.settings);
        setNarrative(data.narrative);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, [year]);

  if (!year) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Select a reporting year to prepare the GHG inventory report.</AlertDescription>
      </Alert>
    );
  }

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const save = (body: { settings?: ReportSettings; narrative?: NarrativeState }, message: string) =>
    run('save', async () => {
      const response = await fetch(`/api/report?year=${year}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      setSettings(data.settings);
      setNarrative(data.narrative);
      setReport((current) => (current ? { ...current, blockers: data.blockers, boundary: data.boundary } : current));
      setNotice(message);
    });

  const draftWithAi = () =>
    run('draft', async () => {
      const response = await fetch(`/api/report/narrative?year=${year}`, { method: 'POST' });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      setNarrative(data.narrative);
      setReport((current) => (current ? { ...current, blockers: data.blockers } : current));
      setNotice('AI drafts created. Review each one, edit if needed, and approve it.');
    });

  const downloadPdf = (mode: 'draft' | 'final') =>
    run(mode, async () => {
      const response = await fetch(`/api/report/pdf?year=${year}&mode=${mode}`);
      if (!response.ok) throw new Error(await readError(response));
      const fileName =
        response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || `GHG_Inventory_${year}.pdf`;
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    });

  // Editing an AI field withdraws its approval until it is reviewed again.
  const editNarrative = (key: NarrativeKey, value: string | RecommendationRow[]) =>
    setNarrative((current) =>
      current
        ? { ...current, fields: { ...current.fields, [key]: value }, approved: { ...current.approved, [key]: false } }
        : current
    );

  const toggleApproval = (key: NarrativeKey) =>
    setNarrative((current) =>
      current ? { ...current, approved: { ...current.approved, [key]: !current.approved[key] } } : current
    );

  const editRecommendation = (index: number, key: keyof RecommendationRow, value: string) => {
    if (!narrative) return;
    const rows = narrative.fields.recommendations.map((row, i) => (i === index ? { ...row, [key]: value } : row));
    editNarrative('recommendations', rows);
  };

  const setBoundaryNote = (category: string, value: string) =>
    setSettings((current) =>
      current ? { ...current, boundary_notes: { ...(current.boundary_notes || {}), [category]: value } } : current
    );

  const blockers = report?.blockers || [];
  const ready = blockers.length === 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>GHG inventory report {year}</CardTitle>
            <CardDescription>
              GHG Protocol Corporate Standard report. Preview it in the browser or export it as an A4 PDF.
            </CardDescription>
          </div>
          <Badge variant={ready ? 'default' : 'secondary'}>{ready ? 'Ready for final export' : 'Draft'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="whitespace-pre-line">{error}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        {!report && !error && <p className="text-sm text-muted-foreground">Loading report data…</p>}

        {report && settings && narrative && (
          <>
            {report.warnings.map((warning) => (
              <Alert key={warning}>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{warning}</AlertDescription>
              </Alert>
            ))}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                ['Total', report.summary.total_tco2e],
                ['Scope 1', report.summary.scope1_tco2e],
                ['Scope 2', report.summary.scope2_tco2e],
                ['Scope 3', report.summary.scope3_tco2e],
                ['Outside scopes (HCFC)', report.summary.outside_scopes_tco2e],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-lg font-semibold">{value}</p>
                  <p className="text-xs text-muted-foreground">tCO2e</p>
                </div>
              ))}
            </div>
            {report.summary.excluded.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Excluded (no data or outside boundary): {report.summary.excluded.join('; ')}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <a href={`/api/report?year=${year}&format=html&mode=draft`} target="_blank" rel="noreferrer">
                  <Eye className="mr-2 h-4 w-4" />
                  Preview
                </a>
              </Button>
              <Button variant="outline" onClick={() => downloadPdf('draft')} disabled={busy !== null}>
                <Download className="mr-2 h-4 w-4" />
                {busy === 'draft' ? 'Generating…' : 'Draft PDF'}
              </Button>
              <Button
                onClick={() => downloadPdf('final')}
                disabled={busy !== null || !ready}
                className="bg-green-600 hover:bg-green-700"
              >
                <FileCheck2 className="mr-2 h-4 w-4" />
                {busy === 'final' ? 'Generating…' : 'Export final PDF'}
              </Button>
            </div>

            {!ready && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <p className="font-medium">Before final export:</p>
                <ul className="mt-1 list-disc pl-5">
                  {blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </div>
            )}

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Report details</h3>
                <Button size="sm" onClick={() => save({ settings }, 'Report details saved.')} disabled={busy !== null}>
                  <Save className="mr-2 h-4 w-4" />
                  {busy === 'save' ? 'Saving…' : 'Save details'}
                </Button>
              </div>
              {SETTING_GROUPS.map((group) => (
                <div key={group.title} className="space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">{group.title}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {group.fields.map((field) => (
                      <div key={field.key} className={field.long ? 'space-y-1 sm:col-span-2' : 'space-y-1'}>
                        <Label htmlFor={`report-${field.key}`}>{field.label}</Label>
                        {field.long ? (
                          <Textarea
                            id={`report-${field.key}`}
                            rows={3}
                            value={settings[field.key]}
                            onChange={(event) => setSettings({ ...settings, [field.key]: event.target.value })}
                          />
                        ) : (
                          <Input
                            id={`report-${field.key}`}
                            value={settings[field.key]}
                            onChange={(event) => setSettings({ ...settings, [field.key]: event.target.value })}
                          />
                        )}
                        {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold">Operational boundary – reasons (Section 3.2)</h3>
                  <p className="text-xs text-muted-foreground">
                    Record why each category is excluded or incomplete (for example: data owner has not provided records,
                    meter not installed, outside operational control). The reason is printed in the report and is required
                    for every Excluded category.
                  </p>
                </div>
                <Button size="sm" onClick={() => save({ settings }, 'Boundary reasons saved.')} disabled={busy !== null}>
                  <Save className="mr-2 h-4 w-4" />
                  Save reasons
                </Button>
              </div>
              {report.boundary.map((row) => (
                <div key={row.scope_category} className="space-y-1 rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{row.scope_category}</p>
                    <Badge variant={row.status === 'Included' ? 'default' : row.status === 'Excluded' ? 'destructive' : 'secondary'}>
                      {row.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{row.basis}</p>
                  <Textarea
                    rows={2}
                    placeholder={
                      row.status === 'Excluded'
                        ? 'Required: why is there no data for this category, and what is being done about it?'
                        : 'Optional: note on missing months or data quality'
                    }
                    value={settings.boundary_notes?.[row.scope_category] || ''}
                    onChange={(event) => setBoundaryNote(row.scope_category, event.target.value)}
                  />
                </div>
              ))}
            </section>

            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold">AI-drafted sections</h3>
                  <p className="text-xs text-muted-foreground">
                    Drafted only from the calculated figures. Numbers that do not appear in the report data are flagged.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={draftWithAi} disabled={busy !== null}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {busy === 'draft' ? 'Drafting…' : 'Draft with AI'}
                  </Button>
                  <Button size="sm" onClick={() => save({ narrative }, 'AI sections saved.')} disabled={busy !== null}>
                    <Save className="mr-2 h-4 w-4" />
                    Save sections
                  </Button>
                </div>
              </div>

              {NARRATIVE_FIELDS.map((field) => (
                <div key={field.key} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={`narrative-${field.key}`}>{field.label}</Label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(narrative.approved[field.key])}
                        onChange={() => toggleApproval(field.key)}
                        disabled={!narrative.fields[field.key]}
                      />
                      Approved
                    </label>
                  </div>
                  <Textarea
                    id={`narrative-${field.key}`}
                    rows={field.key === 'hotspot_analysis' ? 8 : 4}
                    value={narrative.fields[field.key]}
                    onChange={(event) => editNarrative(field.key, event.target.value)}
                  />
                  {narrative.flags[field.key] && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Check these numbers against the report data: {narrative.flags[field.key]!.join(', ')}
                    </p>
                  )}
                </div>
              ))}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Section 8 – Recommendations</Label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(narrative.approved.recommendations)}
                      onChange={() => toggleApproval('recommendations')}
                      disabled={narrative.fields.recommendations.length === 0}
                    />
                    Approved
                  </label>
                </div>
                {narrative.fields.recommendations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recommendations yet. Use “Draft with AI”.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          {RECOMMENDATION_COLUMNS.map((column) => (
                            <th key={column.key} className="p-1 font-medium">
                              {column.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {narrative.fields.recommendations.map((row, index) => (
                          <tr key={index}>
                            {RECOMMENDATION_COLUMNS.map((column) => (
                              <td key={column.key} className="p-1 align-top">
                                <Input
                                  value={row[column.key]}
                                  onChange={(event) => editRecommendation(index, column.key, event.target.value)}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {narrative.flags.recommendations && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Check these numbers against the report data: {narrative.flags.recommendations.join(', ')}
                  </p>
                )}
              </div>
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
