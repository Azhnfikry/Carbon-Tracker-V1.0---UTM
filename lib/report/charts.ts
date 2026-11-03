// Inline SVG charts for the report, drawn at generation time (no scripts in the output).
import { formatTonnes } from "@/lib/report/format";

const FONT = 'font-family="Poppins, Arial, Helvetica, sans-serif"';
const INK = "#3E3E3E";
const MUTED = "#6B6B6B";
const RULE = "#DCDCDC";

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Rounded axis maximum and tick step for a value range starting at 0.
function niceScale(max: number, ticks = 5) {
  if (max <= 0) return { max: 1, step: 0.2 };
  const rough = max / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) || rough;
  return { max: Math.ceil(max / step) * step, step };
}

const tickLabel = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value);

// Section 5.1: horizontal bar per scope.
export function scopeBarChart(scopes: Array<{ label: string; value: number }>, colours: string[]): string {
  const width = 640;
  const labelWidth = 150;
  const barHeight = 30;
  const gap = 16;
  const top = 10;
  const plotWidth = width - labelWidth - 90;
  const plotHeight = scopes.length * (barHeight + gap) - gap;
  const height = top + plotHeight + 46;
  const { max, step } = niceScale(Math.max(...scopes.map((s) => s.value), 0));
  const x = (value: number) => labelWidth + (value / max) * plotWidth;

  const grid: string[] = [];
  for (let value = 0; value <= max + step / 2; value += step) {
    grid.push(
      `<line x1="${x(value)}" y1="${top}" x2="${x(value)}" y2="${top + plotHeight}" stroke="${RULE}" stroke-width="1"/>` +
        `<text x="${x(value)}" y="${top + plotHeight + 16}" text-anchor="middle" font-size="10" fill="${MUTED}">${tickLabel(value)}</text>`
    );
  }

  const bars = scopes.map((scope, index) => {
    const y = top + index * (barHeight + gap);
    const barWidth = Math.max((scope.value / max) * plotWidth, scope.value > 0 ? 1 : 0);
    return (
      `<text x="${labelWidth - 10}" y="${y + barHeight / 2 + 4}" text-anchor="end" font-size="11" fill="${INK}">${escape(scope.label)}</text>` +
      `<rect x="${labelWidth}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${colours[index]}"/>` +
      `<text x="${labelWidth + barWidth + 6}" y="${y + barHeight / 2 + 4}" font-size="11" font-weight="600" fill="${INK}">${formatTonnes(scope.value)}</text>`
    );
  });

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Emissions by scope (tCO2e)" ${FONT}>` +
    grid.join("") +
    bars.join("") +
    `<text x="${labelWidth + plotWidth / 2}" y="${height - 6}" text-anchor="middle" font-size="10" fill="${MUTED}">Emissions (tCO₂e)</text>` +
    `</svg>`
  );
}

// Section 5.4: stacked monthly columns by scope.
export function monthlyStackedChart(
  months: Array<{ month: string; scope1: number; scope2: number; scope3: number }>,
  colours: string[]
): string {
  const width = 640;
  const height = 300;
  const left = 56;
  const right = 12;
  const top = 34;
  const bottom = 40;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const totals = months.map((m) => m.scope1 + m.scope2 + m.scope3);
  const { max, step } = niceScale(Math.max(...totals, 0));
  const y = (value: number) => top + plotHeight - (value / max) * plotHeight;
  const slot = plotWidth / months.length;
  const barWidth = slot * 0.62;

  const grid: string[] = [];
  for (let value = 0; value <= max + step / 2; value += step) {
    grid.push(
      `<line x1="${left}" y1="${y(value)}" x2="${width - right}" y2="${y(value)}" stroke="${RULE}" stroke-width="1"/>` +
        `<text x="${left - 6}" y="${y(value) + 3}" text-anchor="end" font-size="10" fill="${MUTED}">${tickLabel(value)}</text>`
    );
  }

  const columns = months.map((month, index) => {
    const x = left + index * slot + (slot - barWidth) / 2;
    let base = 0;
    const segments = [month.scope1, month.scope2, month.scope3]
      .map((value, scope) => {
        if (value <= 0) return "";
        const rect = `<rect x="${x}" y="${y(base + value)}" width="${barWidth}" height="${y(base) - y(base + value)}" fill="${colours[scope]}"/>`;
        base += value;
        return rect;
      })
      .join("");
    return (
      segments +
      `<text x="${x + barWidth / 2}" y="${top + plotHeight + 15}" text-anchor="middle" font-size="10" fill="${INK}">${month.month}</text>`
    );
  });

  const legend = ["Scope 1", "Scope 2", "Scope 3"]
    .map(
      (label, index) =>
        `<rect x="${left + index * 90}" y="8" width="10" height="10" fill="${colours[index]}"/>` +
        `<text x="${left + index * 90 + 15}" y="17" font-size="10" fill="${INK}">${label}</text>`
    )
    .join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly emissions by scope (tCO2e)" ${FONT}>` +
    legend +
    grid.join("") +
    columns.join("") +
    `<line x1="${left}" y1="${top + plotHeight}" x2="${width - right}" y2="${top + plotHeight}" stroke="${INK}" stroke-width="1"/>` +
    `<text transform="translate(14 ${top + plotHeight / 2}) rotate(-90)" text-anchor="middle" font-size="10" fill="${MUTED}">tCO₂e</text>` +
    `<text x="${left + plotWidth / 2}" y="${height - 4}" text-anchor="middle" font-size="10" fill="${MUTED}">Month</text>` +
    `</svg>`
  );
}
