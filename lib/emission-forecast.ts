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

interface MonthlyAggregatePoint {
	monthKey: string;
	emissions: number;
}

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
	month: "short",
	year: "2-digit",
});

const EPSILON = 0.000001;

const toMonthKey = (date: Date) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const fromMonthKey = (monthKey: string) => new Date(`${monthKey}-01T00:00:00`);

const addMonths = (date: Date, count: number) =>
	new Date(date.getFullYear(), date.getMonth() + count, 1);

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

const average = (values: number[]) =>
	values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const standardDeviation = (values: number[]) => {
	if (values.length <= 1) return 0;

	const mean = average(values);
	const variance = average(values.map((value) => (value - mean) ** 2));
	return Math.sqrt(variance);
};

const aggregateMonthlyEmissions = (records: ForecastInputRecord[]) => {
	const monthlyMap = new Map<string, number>();

	records.forEach((record) => {
		if (!record.date) return;

		const parsedDate = new Date(record.date);
		if (Number.isNaN(parsedDate.getTime())) return;

		const monthKey = toMonthKey(parsedDate);
		monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + (record.co2_equivalent || 0));
	});

	return Array.from(monthlyMap.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([monthKey, emissions]) => ({
			monthKey,
			emissions,
		}));
};

const trimTrailingEmptyMonths = (points: MonthlyAggregatePoint[]) => {
	let trimmed = [...points];

	while (
		trimmed.length > 3 &&
		Math.abs(trimmed[trimmed.length - 1].emissions) <= EPSILON
	) {
		const recentNonZeroAverage = average(
			trimmed
				.slice(Math.max(0, trimmed.length - 4), trimmed.length - 1)
				.map((point) => point.emissions)
				.filter((value) => value > EPSILON)
		);

		if (recentNonZeroAverage <= EPSILON) break;
		trimmed = trimmed.slice(0, -1);
	}

	return trimmed;
};

const calculateWeightedRegressionSlope = (series: number[]) => {
	if (series.length <= 1) return 0;

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

	return denominator === 0 ? 0 : numerator / denominator;
};

const calculateExponentialSmoothing = (series: number[], alpha = 0.4) => {
	if (series.length === 0) return 0;

	let smoothed = series[0];
	for (let index = 1; index < series.length; index += 1) {
		smoothed = alpha * series[index] + (1 - alpha) * smoothed;
	}

	return smoothed;
};

const calculateAverageGrowthRate = (series: number[]) => {
	if (series.length <= 1) return 0;

	const growthRates: number[] = [];

	for (let index = 1; index < series.length; index += 1) {
		const previous = series[index - 1];
		const current = series[index];

		if (previous <= EPSILON) continue;
		growthRates.push((current - previous) / previous);
	}

	if (growthRates.length === 0) return 0;

	const recentGrowthRates = growthRates.slice(-Math.min(4, growthRates.length));
	return clamp(average(recentGrowthRates), -0.35, 0.35);
};

const calculateSeasonalityFactor = (
	series: number[],
	monthIndex: number,
	baseline: number
) => {
	if (series.length < 12 || baseline <= EPSILON) return 1;

	const seasonalCandidates: number[] = [];

	for (let index = monthIndex - 12; index >= 0; index -= 12) {
		const seasonalValue = series[index];
		if (seasonalValue > EPSILON) {
			seasonalCandidates.push(seasonalValue / baseline);
		}
	}

	if (seasonalCandidates.length === 0) return 1;

	return clamp(average(seasonalCandidates), 0.75, 1.25);
};

export function buildEmissionForecast(
	records: ForecastInputRecord[],
	options?: {
		historyMonths?: number;
		forecastMonths?: number;
	}
): EmissionForecastResult {
	const historyMonths = options?.historyMonths ?? 6;
	const forecastMonths = options?.forecastMonths ?? 3;

	const aggregatedHistory = trimTrailingEmptyMonths(aggregateMonthlyEmissions(records));
	const sortedHistory = aggregatedHistory.map((point) => ({
		monthKey: point.monthKey,
		label: MONTH_LABEL_FORMATTER.format(fromMonthKey(point.monthKey)),
		emissions: point.emissions,
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
	const lastActual = series[series.length - 1] || 0;
	const smoothedLevel = calculateExponentialSmoothing(series, 0.4);
	const slope = calculateWeightedRegressionSlope(series);
	const averageGrowthRate = calculateAverageGrowthRate(series);
	const recentWindow = series.slice(-Math.min(6, series.length));
	const recentAverage = average(recentWindow);
	const baseline = Math.max(recentAverage || smoothedLevel || lastActual || 0, 1);
	const forecastBaseDate = fromMonthKey(sortedHistory[sortedHistory.length - 1].monthKey);

	let previousForecast = lastActual > EPSILON ? lastActual : smoothedLevel;

	const forecast = Array.from({ length: forecastMonths }, (_, forecastIndex) => {
		const horizon = forecastIndex + 1;
		const monthDate = addMonths(forecastBaseDate, horizon);
		const monthKey = toMonthKey(monthDate);
		const monthSeriesIndex = series.length + forecastIndex;

		const dampedGrowth = averageGrowthRate * Math.exp(-0.45 * forecastIndex);
		const dampedSlope = slope * Math.exp(-0.3 * forecastIndex);
		const trendBasedValue = previousForecast * (1 + dampedGrowth) + dampedSlope;
		const levelAnchor = smoothedLevel + slope * horizon * 0.5;
		const seasonalityFactor = calculateSeasonalityFactor(series, monthSeriesIndex, baseline);
		const blendedValue =
			trendBasedValue * 0.55 + levelAnchor * 0.3 + previousForecast * 0.15;
		const emissions = Math.max(0, blendedValue * seasonalityFactor);

		previousForecast = emissions;

		return {
			monthKey,
			label: MONTH_LABEL_FORMATTER.format(monthDate),
			emissions,
			type: "predicted" as const,
		};
	});

	const projectedNextMonth = forecast[0]?.emissions || 0;
	const projectedQuarterTotal = forecast
		.slice(0, Math.min(3, forecast.length))
		.reduce((sum, point) => sum + point.emissions, 0);
	const trendPercent =
		lastActual > EPSILON ? ((projectedNextMonth - lastActual) / lastActual) * 100 : 0;

	const volatility = standardDeviation(recentWindow) / baseline;
	const dataCoverageScore = clamp(sortedHistory.length / 18, 0, 1);
	const stabilityScore = clamp(1 - volatility, 0, 1);
	const confidenceScore = dataCoverageScore * 0.55 + stabilityScore * 0.45;

	const modelConfidence =
		confidenceScore >= 0.72 ? "high" : confidenceScore >= 0.45 ? "medium" : "low";

	return {
		history: sortedHistory.slice(-historyMonths),
		forecast,
		projectedNextMonth,
		projectedQuarterTotal,
		trendPercent,
		modelConfidence,
	};
}
