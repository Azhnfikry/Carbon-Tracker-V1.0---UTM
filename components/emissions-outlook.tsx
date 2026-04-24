"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/client";
import { buildEmissionForecast, type MonthlyEmissionPoint } from "@/lib/emission-forecast";
import {
	buildScenarioAnalysis,
	type ScenarioInputs,
	type ScenarioChartPoint,
} from "@/lib/emission-scenario";
import {
	CartesianGrid,
	Legend,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import {
	TrendingUp,
	TrendingDown,
	Target,
	Zap,
	AlertCircle,
	CheckCircle2,
	BarChart3,
	Lightbulb,
	Brain,
	SlidersHorizontal,
	Factory,
	Car,
	SunMedium,
	Receipt,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";

interface EmissionRecord {
	id: string;
	activity_type: string;
	category: string;
	scope: number;
	co2_equivalent: number;
	date: string;
	created_at: string;
}

interface ForecastChartPoint extends MonthlyEmissionPoint {
	historicalEmissions: number | null;
	predictedEmissions: number | null;
}

interface MetricsData {
	totalEmissions: number;
	lastMonthEmissions: number;
	reductionPercent: number;
	scope1: number;
	scope2: number;
	scope3: number;
	topSources: Array<{ activity: string; emissions: number; percent: number }>;
	yearOverYearGrowth: number;
	forecastChart: ForecastChartPoint[];
	annualForecast: MonthlyEmissionPoint[];
	projectedNextMonth: number;
	projectedQuarterTotal: number;
	projectedTrendPercent: number;
	modelConfidence: "low" | "medium" | "high";
}

const DEFAULT_SCENARIO_INPUTS: ScenarioInputs = {
	solarAdoptionPercent: 30,
	evFleetPercent: 20,
	supplierSwitchPercent: 15,
	carbonTaxRate: 60,
};

const priorityStyles = {
	high: "border-red-600 bg-red-50 text-red-800",
	medium: "border-amber-600 bg-amber-50 text-amber-800",
	low: "border-blue-600 bg-blue-50 text-blue-800",
} as const;

const formatNumber = (value: number) => value.toFixed(0);

export function EmissionsOutlook({ user }: { user: User | null }) {
	const [metrics, setMetrics] = useState<MetricsData | null>(null);
	const [scenarioInputs, setScenarioInputs] = useState<ScenarioInputs>(DEFAULT_SCENARIO_INPUTS);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState("");
	const supabase = createClient();

	useEffect(() => {
		if (user) {
			void fetchEmissionsData();
			return;
		}

		setMetrics(null);
		setIsLoading(false);
	}, [user]);

	const fetchEmissionsData = async () => {
		setIsLoading(true);
		setError("");

		try {
			const { data, error: fetchError } = await supabase
				.from("emissions")
				.select("*")
				.eq("user_id", user?.id)
				.order("date", { ascending: false });

			if (fetchError) throw fetchError;

			const emissions = (data as EmissionRecord[]) || [];
			const now = new Date();
			const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
			const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

			const currentMonthEmissions = emissions
				.filter((entry) => {
					const date = new Date(entry.date);
					return date >= thisMonth;
				})
				.reduce((sum, entry) => sum + (entry.co2_equivalent || 0), 0);

			const lastMonthEmissions = emissions
				.filter((entry) => {
					const date = new Date(entry.date);
					return date >= lastMonth && date < thisMonth;
				})
				.reduce((sum, entry) => sum + (entry.co2_equivalent || 0), 0);

			const totalEmissions = emissions.reduce(
				(sum, entry) => sum + (entry.co2_equivalent || 0),
				0
			);

			const reductionPercent =
				lastMonthEmissions > 0
					? ((lastMonthEmissions - currentMonthEmissions) / lastMonthEmissions) * 100
					: 0;

			const scope1 = emissions
				.filter((entry) => entry.scope === 1)
				.reduce((sum, entry) => sum + (entry.co2_equivalent || 0), 0);
			const scope2 = emissions
				.filter((entry) => entry.scope === 2)
				.reduce((sum, entry) => sum + (entry.co2_equivalent || 0), 0);
			const scope3 = emissions
				.filter((entry) => entry.scope === 3)
				.reduce((sum, entry) => sum + (entry.co2_equivalent || 0), 0);

			const activityMap = new Map<string, number>();
			emissions.forEach((entry) => {
				activityMap.set(
					entry.activity_type,
					(activityMap.get(entry.activity_type) || 0) + (entry.co2_equivalent || 0)
				);
			});

			const topSources = Array.from(activityMap.entries())
				.map(([activity, emissionTotal]) => ({
					activity,
					emissions: emissionTotal,
					percent: totalEmissions > 0 ? (emissionTotal / totalEmissions) * 100 : 0,
				}))
				.sort((a, b) => b.emissions - a.emissions)
				.slice(0, 5);

			const currentYearStart = new Date(now.getFullYear(), 0, 1);
			const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
			const lastYearEnd = new Date(now.getFullYear(), 0, 1);

			const currentYearEmissions = emissions
				.filter((entry) => {
					const date = new Date(entry.date);
					return date >= currentYearStart;
				})
				.reduce((sum, entry) => sum + (entry.co2_equivalent || 0), 0);

			const lastYearEmissions = emissions
				.filter((entry) => {
					const date = new Date(entry.date);
					return date >= lastYearStart && date < lastYearEnd;
				})
				.reduce((sum, entry) => sum + (entry.co2_equivalent || 0), 0);

			const yearOverYearGrowth =
				lastYearEmissions > 0
					? ((currentYearEmissions - lastYearEmissions) / lastYearEmissions) * 100
					: 0;

			const forecast = buildEmissionForecast(emissions, {
				historyMonths: 6,
				forecastMonths: 12,
			});

			const forecastChart = [...forecast.history, ...forecast.forecast].map((point) => ({
				...point,
				historicalEmissions: point.type === "historical" ? point.emissions : null,
				predictedEmissions: point.type === "predicted" ? point.emissions : null,
			}));

			setMetrics({
				totalEmissions,
				lastMonthEmissions,
				reductionPercent,
				scope1,
				scope2,
				scope3,
				topSources,
				yearOverYearGrowth,
				forecastChart,
				annualForecast: forecast.forecast,
				projectedNextMonth: forecast.projectedNextMonth,
				projectedQuarterTotal: forecast.projectedQuarterTotal,
				projectedTrendPercent: forecast.trendPercent,
				modelConfidence: forecast.modelConfidence,
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to fetch emissions data");
		} finally {
			setIsLoading(false);
		}
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center p-8">
				<p className="text-gray-600">Loading emissions data...</p>
			</div>
		);
	}

	if (error) {
		return (
			<Alert variant="destructive">
				<AlertCircle className="h-4 w-4" />
				<AlertDescription>{error}</AlertDescription>
			</Alert>
		);
	}

	if (!metrics || metrics.totalEmissions === 0) {
		return (
			<Alert>
				<AlertCircle className="h-4 w-4" />
				<AlertDescription>
					No emissions data available. Start by adding emission entries to see insights.
				</AlertDescription>
			</Alert>
		);
	}

	const confidenceLabel =
		metrics.modelConfidence === "high"
			? "High confidence"
			: metrics.modelConfidence === "medium"
				? "Moderate confidence"
				: "Early estimate";

	const scenario = buildScenarioAnalysis({
		forecast: metrics.annualForecast,
		scope1: metrics.scope1,
		scope2: metrics.scope2,
		scope3: metrics.scope3,
		inputs: scenarioInputs,
	});

	const scenarioControls = [
		{
			id: "solarAdoptionPercent",
			label: "Solar adoption",
			icon: SunMedium,
			value: scenarioInputs.solarAdoptionPercent,
			max: 100,
			suffix: "%",
			description: "Reduce purchased electricity emissions through on-site solar or greener power.",
		},
		{
			id: "evFleetPercent",
			label: "EV fleet transition",
			icon: Car,
			value: scenarioInputs.evFleetPercent,
			max: 100,
			suffix: "%",
			description: "Shift fuel-based fleet activity into electric vehicles and cleaner transport.",
		},
		{
			id: "supplierSwitchPercent",
			label: "Supplier switch",
			icon: Factory,
			value: scenarioInputs.supplierSwitchPercent,
			max: 100,
			suffix: "%",
			description: "Move procurement volume to lower-carbon suppliers and materials.",
		},
		{
			id: "carbonTaxRate",
			label: "Carbon tax",
			icon: Receipt,
			value: scenarioInputs.carbonTaxRate,
			max: 200,
			suffix: "RM/tCO2e",
			description: "Stress-test financial exposure under a carbon pricing scenario.",
		},
	] as const;

	const topScenarioStrategy = scenario.strategies[0];
	const nextBestStrategy = scenario.strategies[1];

	return (
		<div className="space-y-6">
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
				<Card>
					<CardContent className="pt-6">
						<div className="text-center">
							<p className="mb-2 text-sm text-gray-600">Total Emissions</p>
							<p className="text-3xl font-bold">{formatNumber(metrics.totalEmissions)}</p>
							<p className="mt-1 text-xs text-gray-500">kg CO2e</p>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardContent className="pt-6">
						<div className="text-center">
							<p className="mb-2 text-sm text-gray-600">This Month vs Last</p>
							<div className="flex items-center justify-center gap-2">
								{metrics.reductionPercent >= 0 ? (
									<TrendingDown className="h-5 w-5 text-green-600" />
								) : (
									<TrendingUp className="h-5 w-5 text-red-600" />
								)}
								<p className="text-3xl font-bold">
									{Math.abs(metrics.reductionPercent).toFixed(1)}%
								</p>
							</div>
							<p className="mt-1 text-xs text-gray-500">
								{metrics.reductionPercent >= 0 ? "Reduction" : "Increase"}
							</p>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardContent className="pt-6">
						<div className="text-center">
							<p className="mb-2 text-sm text-gray-600">Year-over-Year</p>
							<div className="flex items-center justify-center gap-2">
								{metrics.yearOverYearGrowth <= 0 ? (
									<TrendingDown className="h-5 w-5 text-green-600" />
								) : (
									<TrendingUp className="h-5 w-5 text-red-600" />
								)}
								<p className="text-3xl font-bold">
									{Math.abs(metrics.yearOverYearGrowth).toFixed(1)}%
								</p>
							</div>
							<p className="mt-1 text-xs text-gray-500">
								{metrics.yearOverYearGrowth <= 0 ? "Improvement" : "Growth"}
							</p>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardContent className="pt-6">
						<div className="text-center">
							<p className="mb-2 text-sm text-gray-600">Predicted Next Month</p>
							<p className="text-3xl font-bold">
								{formatNumber(metrics.projectedNextMonth)}
							</p>
							<p className="mt-1 text-xs text-gray-500">kg CO2e forecast</p>
						</div>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Brain className="h-5 w-5" />
						Forecasting Engine
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
						<div className="rounded-xl border bg-slate-50 p-4">
							<p className="text-sm text-gray-600">Projected Next Month</p>
							<p className="mt-2 text-2xl font-bold">
								{formatNumber(metrics.projectedNextMonth)} kg CO2e
							</p>
						</div>
						<div className="rounded-xl border bg-slate-50 p-4">
							<p className="text-sm text-gray-600">Projected Next 3 Months</p>
							<p className="mt-2 text-2xl font-bold">
								{formatNumber(metrics.projectedQuarterTotal)} kg CO2e
							</p>
						</div>
						<div className="rounded-xl border bg-slate-50 p-4">
							<p className="text-sm text-gray-600">Model Signal</p>
							<div className="mt-2 flex items-center gap-2">
								{metrics.projectedTrendPercent <= 0 ? (
									<TrendingDown className="h-5 w-5 text-green-600" />
								) : (
									<TrendingUp className="h-5 w-5 text-red-600" />
								)}
								<p className="text-2xl font-bold">
									{Math.abs(metrics.projectedTrendPercent).toFixed(1)}%
								</p>
							</div>
							<p className="mt-1 text-xs text-gray-500">
								{metrics.projectedTrendPercent <= 0
									? "Expected decrease"
									: "Expected increase"}{" "}
								- {confidenceLabel}
							</p>
						</div>
					</div>

					<div className="h-80">
						<ResponsiveContainer width="100%" height="100%">
							<LineChart data={metrics.forecastChart} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
								<CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
								<XAxis dataKey="label" />
								<YAxis
									tickFormatter={(value) => `${Number(value).toFixed(0)}`}
									label={{
										value: "kg CO2e",
										angle: -90,
										position: "insideLeft",
										style: { textAnchor: "middle", fill: "#6b7280" },
									}}
								/>
								<Tooltip
									formatter={(value) => {
										if (value === null || value === undefined) return "";
										return `${Number(value).toFixed(0)} kg CO2e`;
									}}
								/>
								<Legend />
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
									name="12-Month Forecast"
									stroke="#ea580c"
									strokeWidth={3}
									strokeDasharray="6 6"
									dot={{ r: 4 }}
									connectNulls={false}
								/>
							</LineChart>
						</ResponsiveContainer>
					</div>

					<p className="text-sm text-gray-600">
						The forecasting engine projects a 12-month emissions path using recent trend,
						smoothed demand, and seasonal pattern checks. The scenario engine below then tests
						how decarbonization choices could change that path.
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<SlidersHorizontal className="h-5 w-5" />
						Scenario Engine
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
						<div className="space-y-4 rounded-xl border bg-slate-50 p-4">
							{scenarioControls.map((control) => {
								const Icon = control.icon;

								return (
									<div key={control.id} className="space-y-2">
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2">
												<Icon className="h-4 w-4 text-slate-700" />
												<p className="text-sm font-medium">{control.label}</p>
											</div>
											<p className="text-sm font-semibold text-slate-900">
												{control.value} {control.suffix}
											</p>
										</div>
										<input
											type="range"
											min={0}
											max={control.max}
											step={1}
											value={control.value}
											onChange={(event) =>
												setScenarioInputs((current) => ({
													...current,
													[control.id]: Number(event.target.value),
												}))
											}
											className="w-full accent-emerald-600"
										/>
										<p className="text-xs text-gray-600">{control.description}</p>
									</div>
								);
							})}
						</div>

						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							<div className="rounded-xl border bg-emerald-50 p-4">
								<p className="text-sm text-gray-600">Baseline 12-Month Forecast</p>
								<p className="mt-2 text-2xl font-bold text-emerald-900">
									{formatNumber(scenario.annualBaselineEmissions)} kg CO2e
								</p>
							</div>
							<div className="rounded-xl border bg-green-50 p-4">
								<p className="text-sm text-gray-600">Scenario 12-Month Outcome</p>
								<p className="mt-2 text-2xl font-bold text-green-900">
									{formatNumber(scenario.annualScenarioEmissions)} kg CO2e
								</p>
							</div>
							<div className="rounded-xl border bg-blue-50 p-4">
								<p className="text-sm text-gray-600">Avoided Emissions</p>
								<p className="mt-2 text-2xl font-bold text-blue-900">
									{formatNumber(scenario.annualAvoidedEmissions)} kg CO2e
								</p>
								<p className="mt-1 text-xs text-gray-600">
									{scenario.annualReductionPercent.toFixed(1)}% reduction against baseline
								</p>
							</div>
							<div className="rounded-xl border bg-amber-50 p-4">
								<p className="text-sm text-gray-600">Carbon Tax Exposure</p>
								<p className="mt-2 text-2xl font-bold text-amber-900">
									RM {formatNumber(scenario.scenarioCarbonTaxCost)}
								</p>
								<p className="mt-1 text-xs text-gray-600">
									RM {formatNumber(scenario.carbonTaxSavings)} avoided vs baseline
								</p>
							</div>
						</div>
					</div>

					<div className="h-80">
						<ResponsiveContainer width="100%" height="100%">
							<LineChart data={scenario.chart} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
								<CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
								<XAxis dataKey="month" />
								<YAxis
									tickFormatter={(value) => `${Number(value).toFixed(0)}`}
									label={{
										value: "kg CO2e",
										angle: -90,
										position: "insideLeft",
										style: { textAnchor: "middle", fill: "#6b7280" },
									}}
								/>
								<Tooltip
									formatter={(value) => `${Number(value).toFixed(0)} kg CO2e`}
								/>
								<Legend />
								<Line
									type="monotone"
									dataKey="baselineEmissions"
									name="Baseline forecast"
									stroke="#64748b"
									strokeWidth={3}
									dot={false}
								/>
								<Line
									type="monotone"
									dataKey="scenarioEmissions"
									name="Scenario outcome"
									stroke="#16a34a"
									strokeWidth={3}
									dot={{ r: 3 }}
								/>
							</LineChart>
						</ResponsiveContainer>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<BarChart3 className="h-5 w-5" />
						Scope Breakdown
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						{[
							{ scope: 1, name: "Scope 1 (Direct)", value: metrics.scope1, color: "bg-red-500" },
							{
								scope: 2,
								name: "Scope 2 (Indirect Energy)",
								value: metrics.scope2,
								color: "bg-orange-500",
							},
							{
								scope: 3,
								name: "Scope 3 (Other Indirect)",
								value: metrics.scope3,
								color: "bg-blue-500",
							},
						].map((item) => {
							const percent =
								metrics.totalEmissions > 0
									? (item.value / metrics.totalEmissions) * 100
									: 0;

							return (
								<div key={item.scope}>
									<div className="mb-2 flex justify-between">
										<span className="text-sm font-medium">{item.name}</span>
										<span className="text-sm text-gray-600">
											{formatNumber(item.value)} kg CO2e ({percent.toFixed(1)}%)
										</span>
									</div>
									<div className="h-2 w-full rounded-full bg-gray-200">
										<div
											className={`${item.color} h-2 rounded-full`}
											style={{ width: `${percent}%` }}
										/>
									</div>
								</div>
							);
						})}
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<AlertCircle className="h-5 w-5 text-red-600" />
						Top Emission Sources
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-3">
						{metrics.topSources.map((source, index) => (
							<div
								key={index}
								className="flex items-center justify-between rounded-lg bg-gray-50 p-3"
							>
								<div>
									<p className="text-sm font-medium">{source.activity}</p>
									<p className="text-xs text-gray-600">
										{formatNumber(source.emissions)} kg CO2e
									</p>
								</div>
								<div className="text-right">
									<p className="text-sm font-semibold text-red-600">
										{source.percent.toFixed(1)}%
									</p>
									<p className="text-xs text-gray-600">of total</p>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Lightbulb className="h-5 w-5 text-yellow-600" />
						Scenario-Based Reduction Strategy
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					{scenario.strategies.map((strategy) => (
						<div
							key={strategy.id}
							className={`rounded-lg border-l-4 p-4 ${
								priorityStyles[strategy.priority]
							}`}
						>
							<div className="mb-2 flex items-start justify-between gap-4">
								<div>
									<p className="text-sm font-semibold">{strategy.title}</p>
									<p className="mt-1 text-xs text-gray-700">{strategy.summary}</p>
								</div>
								<span className="rounded bg-white/70 px-2 py-1 text-xs font-bold">
									{strategy.priority.toUpperCase()}
								</span>
							</div>
							<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
								<div className="flex items-center gap-2 text-green-700">
									<CheckCircle2 className="h-4 w-4" />
									<span className="text-sm font-medium">
										Current scenario gain: {formatNumber(strategy.annualSavings)} kg CO2e
									</span>
								</div>
								<div className="flex items-center gap-2 text-slate-700">
									<Target className="h-4 w-4" />
									<span className="text-sm font-medium">
										Remaining opportunity: {formatNumber(strategy.remainingOpportunity)}
									</span>
								</div>
							</div>
						</div>
					))}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Target className="h-5 w-5" />
						Decision Support
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-3">
						<div className="flex items-start gap-3 rounded-lg bg-green-50 p-3">
							<CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
							<div>
								<p className="text-sm font-medium">Best lever right now</p>
								<p className="text-xs text-gray-600">
									{topScenarioStrategy.title} has the biggest remaining impact under your
									current assumptions.
								</p>
							</div>
						</div>
						<div className="flex items-start gap-3 rounded-lg bg-blue-50 p-3">
							<Zap className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
							<div>
								<p className="text-sm font-medium">Next best follow-up</p>
								<p className="text-xs text-gray-600">
									{nextBestStrategy
										? `${nextBestStrategy.title} is the next strongest move after the top lever.`
										: "Review your scope mix to identify the next strongest decarbonization action."}
								</p>
							</div>
						</div>
						<div className="flex items-start gap-3 rounded-lg bg-amber-50 p-3">
							<TrendingDown className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
							<div>
								<p className="text-sm font-medium">Financial resilience</p>
								<p className="text-xs text-gray-600">
									Under this scenario, the modeled carbon tax exposure is RM{" "}
									{formatNumber(scenario.scenarioCarbonTaxCost)} over the next 12 months.
								</p>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
