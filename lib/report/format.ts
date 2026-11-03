// Number formatting shared by every part of the GHG inventory report.

const tonneFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const activityFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const integerFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

// tCO2e: 1 decimal place with thousands separators; positive values below 0.1 show as "<0.1".
export function formatTonnes(value: number): string {
  if (!Number.isFinite(value)) return "–";
  if (value > 0 && value < 0.1) return "<0.1";
  if (value < 0 && value > -0.1) return ">-0.1";
  return tonneFormatter.format(value);
}

// Activity data: thousands separators, up to 2 decimals (none from 1,000 up, so wide tables stay legible).
export function formatActivity(value: number): string {
  if (!Number.isFinite(value)) return "–";
  return Math.abs(value) >= 1000 ? integerFormatter.format(value) : activityFormatter.format(value);
}

export function formatInteger(value: number): string {
  return Number.isFinite(value) ? integerFormatter.format(value) : "–";
}

export function formatPercent(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : "–";
}

// Shares of `total` rounded to 1 decimal place. The rounding difference is added to the
// largest item so the column sums to exactly 100.0.
export function roundedShares(values: number[], total = values.reduce((sum, v) => sum + v, 0)): number[] {
  if (total <= 0 || values.length === 0) return values.map(() => 0);
  const shares = values.map((value) => Math.round((value / total) * 1000) / 10);
  const difference = Math.round((100 - shares.reduce((sum, v) => sum + v, 0)) * 10) / 10;
  if (difference !== 0) {
    const largest = values.indexOf(Math.max(...values));
    shares[largest] = Math.round((shares[largest] + difference) * 10) / 10;
  }
  return shares;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(date);
}
