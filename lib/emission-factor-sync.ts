import { emissionFactors as localEmissionFactors } from "@/lib/emission-factors";
import type { EmissionFactor } from "@/types/emission";

const scopeNameToNumber = (scope: string): 1 | 2 | 3 | null => {
  if (scope.includes("1")) return 1;
  if (scope.includes("2")) return 2;
  if (scope.includes("3")) return 3;
  return null;
};

const normalizeNumber = (value: number | string | undefined): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const localFactorsForCalculation = localEmissionFactors
  .map((factor): EmissionFactor | null => {
    const scope = scopeNameToNumber(factor.scope);
    const co2e = normalizeNumber(factor.co2e);

    if (!scope || co2e === undefined) return null;

    return {
      id: factor.id,
      activity_type: factor.type,
      category: factor.section,
      scope,
      unit: factor.units,
      factor: co2e,
      co2: normalizeNumber(factor.co2),
      ch4: normalizeNumber(factor.ch4),
      n2o: normalizeNumber(factor.no2),
      source: factor.ref,
      year: normalizeNumber(factor.year),
    };
  })
  .filter((factor): factor is EmissionFactor => Boolean(factor));

const factorKey = (factor: Pick<EmissionFactor, "scope" | "activity_type">) =>
  `${factor.scope}:${factor.activity_type.toLowerCase()}`;

export function mergeEmissionFactorsWithLocalDefinitions(
  databaseFactors: EmissionFactor[] = []
): EmissionFactor[] {
  const merged = new Map<string, EmissionFactor>();

  databaseFactors.forEach((factor) => {
    merged.set(factorKey(factor), factor);
  });

  localFactorsForCalculation.forEach((factor) => {
    merged.set(factorKey(factor), factor);
  });

  return Array.from(merged.values());
}
