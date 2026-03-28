import type { EmissionEntry, EmissionSummary } from "@/types/emission"

export function calculateCO2Equivalent(activityData: number, emissionFactor: number): number {
  return activityData * emissionFactor
}

// Calculate individual gas emissions by factor value (for flexible sources)
export function calculateGasEmissionsByFactors(
  quantity: number,
  co2Factor: number = 0,
  ch4Factor: number = 0,
  n2oFactor: number = 0
) {
  const co2 = quantity * co2Factor
  const ch4 = quantity * ch4Factor
  const n2o = quantity * n2oFactor
  // CO2e calculation: CO2 + (CH4 × 28) + (N2O × 265)
  // Note: Using GWP (Global Warming Potential) values over 100-year period
  const co2e = co2 + (ch4 * 28) + (n2o * 265)

  return { co2, ch4, n2o, co2e }
}

export function calculateEmissionSummary(entries: EmissionEntry[]): EmissionSummary {
  const summary: EmissionSummary = {
    totalEmissions: 0,
    scope1: 0,
    scope2: 0,
    scope3: 0,
    byCategory: {},
  }

  entries.forEach((entry) => {
    const co2eValue = entry.co2_equivalent || entry.co2Equivalent || 0
    summary.totalEmissions += co2eValue

    // Sum by scope (scope is now a simple number)
    if (entry.scope === 1) summary.scope1 += co2eValue
    if (entry.scope === 2) summary.scope2 += co2eValue
    if (entry.scope === 3) summary.scope3 += co2eValue

    // Sum by category (category is now a simple string)
    if (!summary.byCategory[entry.category]) {
      summary.byCategory[entry.category] = 0
    }
    summary.byCategory[entry.category] += co2eValue
  })

  return summary
}

export function formatEmissions(value: number): string {
  // Convert to tons if value is 1000 kg or more (1 ton = 1000 kg)
  if (value >= 1000) {
    const tons = value / 1000;
    return `${tons.toFixed(2)} t CO₂e`;
  }
  return `${value.toFixed(2)} kg CO₂e`;
}

export function formatGasBreakdown(co2: number, ch4: number, n2o: number): string {
  return `CO₂: ${co2.toFixed(2)} kg | CH₄: ${ch4.toFixed(4)} kg | N₂O: ${n2o.toFixed(4)} kg`
}

export function calculatePercentage(value: number, total: number): string {
  if (total === 0) return "0.0%"
  return `${((value / total) * 100).toFixed(1)}%`
}
