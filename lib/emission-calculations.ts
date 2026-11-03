import type { EmissionEntry, EmissionSummary } from "@/types/emission"

export function calculateCO2Equivalent(activityData: number, emissionFactor: number): number {
  return activityData * emissionFactor
}

// 100-year global warming potentials, IPCC Fifth Assessment Report (AR5).
export const GWP_SET = "IPCC Fifth Assessment Report (AR5)"
export const GWP_CH4 = 28
export const GWP_N2O = 265

// Calculate individual gas emissions (kg of each gas) and convert them to CO2e with AR5 GWPs.
export function calculateGasEmissionsByFactors(
  quantity: number,
  co2Factor: number = 0,
  ch4Factor: number = 0,
  n2oFactor: number = 0
) {
  const co2 = quantity * co2Factor
  const ch4 = quantity * ch4Factor
  const n2o = quantity * n2oFactor
  const co2e = co2 + ch4 * GWP_CH4 + n2o * GWP_N2O

  return { co2, ch4, n2o, co2e }
}

// For factors published only as a combined CO2e value: CO2e = quantity x factor. The gas columns
// keep the legacy 95/3/2 display split; the inventory report does not treat them as a gas breakdown.
export function calculateCombinedFactorEmissions(quantity: number, factor: number) {
  const co2e = quantity * factor
  return { co2: co2e * 0.95, ch4: co2e * 0.03, n2o: co2e * 0.02, co2e }
}

const MASS_TO_KG: Record<string, number> = { kg: 1, tonne: 1000 }

const massUnit = (unit?: string | null): "kg" | "tonne" | null => {
  const lower = (unit || "").toLowerCase().trim()
  if (/^(kg|kgs|kilograms?)$/.test(lower)) return "kg"
  if (/^(t|tons?|tonnes?|tan metrik|metric tons?)$/.test(lower)) return "tonne"
  return null
}

// Converts a quantity reported in `fromUnit` into the unit the emission factor expects.
// Only mass units (kg <-> tonne) are converted; anything else is passed through unchanged.
export function convertToFactorUnit(quantity: number, fromUnit?: string | null, factorUnit?: string | null): number {
  const from = massUnit(fromUnit)
  const to = massUnit(factorUnit)
  if (!from || !to || from === to) return quantity
  return (quantity * MASS_TO_KG[from]) / MASS_TO_KG[to]
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

    if (entry.scope === 1) summary.scope1 += co2eValue
    if (entry.scope === 2) summary.scope2 += co2eValue
    if (entry.scope === 3) summary.scope3 += co2eValue

    if (!summary.byCategory[entry.category]) {
      summary.byCategory[entry.category] = 0
    }
    summary.byCategory[entry.category] += co2eValue
  })

  return summary
}

export function formatEmissions(value: number): string {
  if (value >= 1000) {
    const tons = value / 1000
    return `${tons.toFixed(2)} t CO2e`
  }
  return `${value.toFixed(2)} kg CO2e`
}

export function formatGasBreakdown(co2: number, ch4: number, n2o: number): string {
  return `CO2: ${co2.toFixed(2)} kg | CH4: ${ch4.toFixed(4)} kg | N2O: ${n2o.toFixed(4)} kg`
}

export function calculatePercentage(value: number, total: number): string {
  if (total === 0) return "0.0%"
  return `${((value / total) * 100).toFixed(1)}%`
}
