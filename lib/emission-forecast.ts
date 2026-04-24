export interface ForecastInputRecord {
	date: string;
	co2_equivalent: number | null;
}

export interface MonthlyEmissionPoint {
	monthKey: string;
	label: string;
	emissions: number;
	type: "historical" | "predicted";
}

export interface EmissionForecastResult {
	history: MonthlyEmissionPoint[];
	forecast: MonthlyEmissionPoint[];
	projectedNextMonth: number;
	projectedQuarterTotal: number;
	trendPercent: number;
	modelConfidence: "low" | "medium" | "high";
}

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
	month: "short",
	year: "2-digit",
});

const toMonthKey = (date: Date) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const fromMonthKey = (monthKey: string) => new Date(`${monthKey}-01T00:00:00`);

const addMonths = (date: Date, count: number) =>
	new Date(date.getFullYear(), date.getMonth() + count, 1);

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

export function buildEmissionForecast(
	records: ForecastInputRecord[],
	options?: {
		historyMonths?: number;
		forecastMonths?: number;
	}
): EmissionForecastResult {
	const historyMonths = options?.historyMonths ?? 6;
	const forecastMonths = options?.forecastMonths ?? 3;

	const monthlyMap = new Map<string, number>();

	records.forEach((record) => {
		if (!record.date) return;

		const parsedDate = new Date(record.date);
		if (Number.isNaN(parsedDate.getTime())) return;

		const monthKey = toMonthKey(parsedDate);
		monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + (record.co2_equivalent || 0));
	});

	const sortedHistory = Array.from(monthlyMap.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([monthKey, emissions]) => ({
			monthKey,
			label: MONTH_LABEL_FORMATTER.format(fromMonthKey(monthKey)),
			emissions,
			type: "historical" as const,
		}));

	if (sortedHistory.length === 0) {
		return {
			history: [],
			forecast: [],
			projectedNextMonth: 0,
			projectedQuarterTotal: 0,
			trendPercent: 0,
			modelConfidence: "low",
		};
	}

	const series = sortedHistory.map((point) => point.emissions);
	const weightedPoints = series.map((value, index) => ({
		x: index,
		y: value,
		weight: index + 1,
	}));

	const weightSum = weightedPoints.reduce((sum, point) => sum + point.weight, 0);
	const meanX =
		weightedPoints.reduce((sum, point) => sum + point.x * point.weight, 0) / weightSum;
	const meanY =
		weightedPoints.reduce((sum, point) => sum + point.y * point.weight, 0) / weightSum;

	const numerator = weightedPoints.reduce(
		(sum, point) => sum + point.weight * (point.x - meanX) * (point.y - meanY),
		0
	);
	const denominator = weightedPoints.reduce(
		(sum, point) => sum + point.weight * (point.x - meanX) ** 2,
		0
	);

	const slope = denominator === 0 ? 0 : numerator / denominator;
	const intercept = meanY - slope * meanX;

	let smoothed = series[0] || 0;
	const alpha = 0.45;
	for (let index = 1; index < series.length; index += 1) {
		smoothed = alpha * series[index] + (1 - alpha) * smoothed;
	}

	const recentWindow = series.slice(-Math.min(4, series.length));
	const recentAverage =
		recentWindow.reduce((sum, value) => sum + value, 0) / Math.max(recentWindow.length, 1);

	const baseline = recentAverage || smoothed || meanY || 1;
	const forecastBaseDate = fromMonthKey(sortedHistory[sortedHistory.length - 1].monthKey);

	const forecast = Array.from({ length: forecastMonths }, (_, forecastIndex) => {
		const x = series.length + forecastIndex;
		const regressionPrediction = intercept + slope * x;
		const blendedPrediction = regressionPrediction * 0.65 + smoothed * 0.35;
		const emissions = Math.max(0, blendedPrediction);
		const monthDate = addMonths(forecastBaseDate, forecastIndex + 1);
		const monthKey = toMonthKey(monthDate);

		return {
			monthKey,
			label: MONTH_LABEL_FORMATTER.format(monthDate),
			emissions,
			type: "predicted" as const,
		};
	});

	const projectedNextMonth = forecast[0]?.emissions || 0;
	const projectedQuarterTotal = forecast.reduce((sum, point) => sum + point.emissions, 0);

	const lastActual = sortedHistory[sortedHistory.length - 1]?.emissions || 0;
	const trendPercent =
		lastActual > 0 ? ((projectedNextMonth - lastActual) / lastActual) * 100 : 0;

	const volatility =
		recentWindow.length > 1
			? Math.sqrt(
					recentWindow.reduce((sum, value) => sum + (value - recentAverage) ** 2, 0) /
						recentWindow.length
			  ) / Math.max(baseline, 1)
			: 1;

	const dataCoverageScore = clamp(sortedHistory.length / 12, 0, 1);
	const stabilityScore = clamp(1 - volatility, 0, 1);
	const confidenceScore = dataCoverageScore * 0.6 + stabilityScore * 0.4;

	const modelConfidence =
		confidenceScore >= 0.7 ? "high" : confidenceScore >= 0.4 ? "medium" : "low";

	return {
		history: sortedHistory.slice(-historyMonths),
		forecast,
		projectedNextMonth,
		projectedQuarterTotal,
		trendPercent,
		modelConfidence,
	};
}
