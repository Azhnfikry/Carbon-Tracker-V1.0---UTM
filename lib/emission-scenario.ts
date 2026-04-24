import type { MonthlyEmissionPoint } from "@/lib/emission-forecast";

export interface ScenarioInputs {
	solarAdoptionPercent: number;
	evFleetPercent: number;
	supplierSwitchPercent: number;
	carbonTaxRate: number;
}

export interface ScenarioChartPoint {
	month: string;
	baselineEmissions: number;
	scenarioEmissions: number;
}

export interface ReductionStrategy {
	id: string;
	title: string;
	priority: "high" | "medium" | "low";
	annualSavings: number;
	remainingOpportunity: number;
	summary: string;
}

export interface ScenarioAnalysisResult {
	annualBaselineEmissions: number;
	annualScenarioEmissions: number;
	annualAvoidedEmissions: number;
	annualReductionPercent: number;
	baselineCarbonTaxCost: number;
	scenarioCarbonTaxCost: number;
	carbonTaxSavings: number;
	chart: ScenarioChartPoint[];
	strategies: ReductionStrategy[];
}

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

const SCOPE2_SOLAR_REDUCTION = 0.85;
const SCOPE1_EV_REDUCTION = 0.6;
const SCOPE3_SUPPLIER_REDUCTION = 0.35;

const getPriority = (opportunity: number, baseline: number): "high" | "medium" | "low" => {
	if (baseline <= 0) return "low";

	const share = opportunity / baseline;
	if (share >= 0.18) return "high";
	if (share >= 0.08) return "medium";
	return "low";
};

const formatPercent = (value: number) => `${value.toFixed(0)}%`;

export function buildScenarioAnalysis(params: {
	forecast: MonthlyEmissionPoint[];
	scope1: number;
	scope2: number;
	scope3: number;
	inputs: ScenarioInputs;
}): ScenarioAnalysisResult {
	const { forecast, scope1, scope2, scope3, inputs } = params;

	const annualBaselineEmissions = forecast.reduce((sum, point) => sum + point.emissions, 0);
	const totalScopes = Math.max(scope1 + scope2 + scope3, 1);
	const scope1Share = scope1 / totalScopes;
	const scope2Share = scope2 / totalScopes;
	const scope3Share = scope3 / totalScopes;

	const solarShare = clamp(inputs.solarAdoptionPercent / 100, 0, 1);
	const evShare = clamp(inputs.evFleetPercent / 100, 0, 1);
	const supplierShare = clamp(inputs.supplierSwitchPercent / 100, 0, 1);
	const carbonTaxRate = clamp(inputs.carbonTaxRate, 0, 1000);

	const chart = forecast.map((point, index) => {
		const rolloutFactor = clamp((index + 1) / 6, 0.2, 1);
		const baselineScope1 = point.emissions * scope1Share;
		const baselineScope2 = point.emissions * scope2Share;
		const baselineScope3 = point.emissions * scope3Share;

		const solarReduction = baselineScope2 * SCOPE2_SOLAR_REDUCTION * solarShare * rolloutFactor;
		const evReduction = baselineScope1 * SCOPE1_EV_REDUCTION * evShare * rolloutFactor;
		const supplierReduction =
			baselineScope3 * SCOPE3_SUPPLIER_REDUCTION * supplierShare * rolloutFactor;

		return {
			month: point.label,
			baselineEmissions: point.emissions,
			scenarioEmissions: Math.max(
				0,
				point.emissions - solarReduction - evReduction - supplierReduction
			),
		};
	});

	const annualScenarioEmissions = chart.reduce(
		(sum, point) => sum + point.scenarioEmissions,
		0
	);
	const annualAvoidedEmissions = Math.max(0, annualBaselineEmissions - annualScenarioEmissions);
	const annualReductionPercent =
		annualBaselineEmissions > 0
			? (annualAvoidedEmissions / annualBaselineEmissions) * 100
			: 0;

	const baselineCarbonTaxCost = (annualBaselineEmissions / 1000) * carbonTaxRate;
	const scenarioCarbonTaxCost = (annualScenarioEmissions / 1000) * carbonTaxRate;
	const carbonTaxSavings = baselineCarbonTaxCost - scenarioCarbonTaxCost;

	const solarAnnualPotential =
		annualBaselineEmissions * scope2Share * SCOPE2_SOLAR_REDUCTION * solarShare;
	const evAnnualPotential =
		annualBaselineEmissions * scope1Share * SCOPE1_EV_REDUCTION * evShare;
	const supplierAnnualPotential =
		annualBaselineEmissions * scope3Share * SCOPE3_SUPPLIER_REDUCTION * supplierShare;

	const solarRemainingOpportunity =
		annualBaselineEmissions * scope2Share * SCOPE2_SOLAR_REDUCTION * (1 - solarShare);
	const evRemainingOpportunity =
		annualBaselineEmissions * scope1Share * SCOPE1_EV_REDUCTION * (1 - evShare);
	const supplierRemainingOpportunity =
		annualBaselineEmissions * scope3Share * SCOPE3_SUPPLIER_REDUCTION * (1 - supplierShare);

	const strategies = [
		{
			id: "solar",
			title: "Scale solar and low-carbon electricity",
			priority: getPriority(solarRemainingOpportunity, annualBaselineEmissions),
			annualSavings: solarAnnualPotential,
			remainingOpportunity: solarRemainingOpportunity,
			summary: `${formatPercent(inputs.solarAdoptionPercent)} solar adoption can materially lower Scope 2 exposure, especially if electricity is one of your main hotspots.`,
		},
		{
			id: "ev",
			title: "Electrify fleet and tighten fuel use",
			priority: getPriority(evRemainingOpportunity, annualBaselineEmissions),
			annualSavings: evAnnualPotential,
			remainingOpportunity: evRemainingOpportunity,
			summary: `${formatPercent(inputs.evFleetPercent)} fleet electrification reduces direct combustion emissions and improves resilience against fuel-price volatility.`,
		},
		{
			id: "supplier",
			title: "Shift to lower-carbon suppliers",
			priority: getPriority(supplierRemainingOpportunity, annualBaselineEmissions),
			annualSavings: supplierAnnualPotential,
			remainingOpportunity: supplierRemainingOpportunity,
			summary: `${formatPercent(inputs.supplierSwitchPercent)} supplier switching lowers Scope 3 emissions and often compounds over procurement cycles.`,
		},
		{
			id: "tax",
			title: "Prepare for carbon-price exposure",
			priority: carbonTaxRate >= 100 ? "high" : carbonTaxRate >= 40 ? "medium" : "low",
			annualSavings: carbonTaxSavings,
			remainingOpportunity: scenarioCarbonTaxCost,
			summary: `At RM ${carbonTaxRate.toFixed(0)} per tCO2e, your scenario avoids RM ${carbonTaxSavings.toFixed(0)} in tax exposure over 12 months.`,
		},
	] satisfies ReductionStrategy[];

	strategies.sort((a, b) => b.remainingOpportunity - a.remainingOpportunity);

	return {
		annualBaselineEmissions,
		annualScenarioEmissions,
		annualAvoidedEmissions,
		annualReductionPercent,
		baselineCarbonTaxCost,
		scenarioCarbonTaxCost,
		carbonTaxSavings,
		chart,
		strategies,
	};
}
