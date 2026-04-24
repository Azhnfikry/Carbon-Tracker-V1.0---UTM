"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/client";
import { buildEmissionForecast, type MonthlyEmissionPoint } from "@/lib/emission-forecast";
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
	monthlyTrend: Array<{ month: string; emissions: number }>;
	yearOverYearGrowth: number;
	forecastChart: ForecastChartPoint[];
	projectedNextMonth: number;
	projectedQuarterTotal: number;
	projectedTrendPercent: number;
	modelConfidence: "low" | "medium" | "high";
}

export function EmissionsOutlook({ user }: { user: User | null }) {
	const [metrics, setMetrics] = useState<MetricsData | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState("");
	const supabase = createClient();

	useEffect(() => {
		if (user) {
			fetchEmissionsData();
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

			const monthlyMap = new Map<string, number>();
			emissions.forEach((entry) => {
				const date = new Date(entry.date);
				const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
				monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + (entry.co2_equivalent || 0));
			});

			const monthlyTrend = Array.from(monthlyMap.entries())
				.sort(([a], [b]) => a.localeCompare(b))
				.slice(-6)
				.map(([month, emissionTotal]) => ({
					month: new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", {
						month: "short",
						year: "2-digit",
					}),
					emissions: emissionTotal,
				}));

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
				forecastMonths: 3,
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
				monthlyTrend,
				yearOverYearGrowth,
				forecastChart,
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

	const recommendations = [
		{
			title: "Switch to Renewable Energy",
			savings: (metrics.scope2 * 0.8).toFixed(0),
			impact: "80% reduction in Scope 2",
			priority: "high",
		},
		{
			title: "Reduce Business Travel",
			savings: (metrics.scope3 * 0.5).toFixed(0),
			impact: "50% reduction in travel emissions",
			priority: "medium",
		},
		{
			title: "Optimize Fleet Efficiency",
			savings: (metrics.scope1 * 0.4).toFixed(0),
			impact: "40% reduction in fuel consumption",
			priority: "medium",
		},
		{
			title: "Partner with Green Suppliers",
			savings: (metrics.scope3 * 0.3).toFixed(0),
			impact: "30% reduction in supply chain",
			priority: "low",
		},
	] as const;

	return (
		<div className="space-y-6">
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Card>
					<CardContent className="pt-6">
						<div className="text-center">
							<p className="mb-2 text-sm text-gray-600">Total Emissions</p>
							<p className="text-3xl font-bold">{metrics.totalEmissions.toFixed(0)}</p>
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
								{metrics.projectedNextMonth.toFixed(0)}
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
						Machine Learning Prediction Trend
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
						<div className="rounded-xl border bg-slate-50 p-4">
							<p className="text-sm text-gray-600">Projected Next Month</p>
							<p className="mt-2 text-2xl font-bold">
								{metrics.projectedNextMonth.toFixed(0)} kg CO2e
							</p>
						</div>
						<div className="rounded-xl border bg-slate-50 p-4">
							<p className="text-sm text-gray-600">Projected Next 3 Months</p>
							<p className="mt-2 text-2xl font-bold">
								{metrics.projectedQuarterTotal.toFixed(0)} kg CO2e
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
							<LineChart
								data={metrics.forecastChart}
								margin={{ top: 8, right: 16, left: 4, bottom: 8 }}
							>
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
									name="Predicted"
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
						This forecast uses recent monthly emissions and a weighted trend model to estimate
						total carbon consumption for the next few months. More historical data improves
						the prediction quality.
					</p>
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
											{item.value.toFixed(0)} kg CO2e ({percent.toFixed(1)}%)
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
										{source.emissions.toFixed(0)} kg CO2e
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
						Reduction Recommendations
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-3">
						{recommendations.map((recommendation, index) => (
							<div
								key={index}
								className={`rounded-lg border-l-4 p-4 ${
									recommendation.priority === "high"
										? "border-red-600 bg-red-50"
										: recommendation.priority === "medium"
											? "border-yellow-600 bg-yellow-50"
											: "border-blue-600 bg-blue-50"
								}`}
							>
								<div className="mb-2 flex items-start justify-between">
									<div>
										<p className="text-sm font-semibold">{recommendation.title}</p>
										<p className="mt-1 text-xs text-gray-700">{recommendation.impact}</p>
									</div>
									<span
										className={`rounded px-2 py-1 text-xs font-bold ${
											recommendation.priority === "high"
												? "bg-red-200 text-red-800"
												: recommendation.priority === "medium"
													? "bg-yellow-200 text-yellow-800"
													: "bg-blue-200 text-blue-800"
										}`}
									>
										{recommendation.priority.toUpperCase()}
									</span>
								</div>
								<div className="flex items-center gap-2 text-green-700">
									<CheckCircle2 className="h-4 w-4" />
									<span className="text-sm font-medium">
										Potential savings: {recommendation.savings} kg CO2e
									</span>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Target className="h-5 w-5" />
						Next Steps
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-3">
						<div className="flex items-start gap-3 rounded-lg bg-green-50 p-3">
							<CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
							<div>
								<p className="text-sm font-medium">Set Reduction Target</p>
								<p className="text-xs text-gray-600">
									Use the forecasted total to set a realistic carbon reduction goal for the
									next quarter.
								</p>
							</div>
						</div>
						<div className="flex items-start gap-3 rounded-lg bg-blue-50 p-3">
							<Zap className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
							<div>
								<p className="text-sm font-medium">Focus on the Highest-Impact Source</p>
								<p className="text-xs text-gray-600">
									Prioritize the activity driving the largest share of emissions to shift the
									forecast faster.
								</p>
							</div>
						</div>
						<div className="flex items-start gap-3 rounded-lg bg-amber-50 p-3">
							<TrendingDown className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
							<div>
								<p className="text-sm font-medium">Monitor Monthly Prediction Drift</p>
								<p className="text-xs text-gray-600">
									Compare actual totals against the forecast each month and retrain the trend
									with fresh data.
								</p>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
