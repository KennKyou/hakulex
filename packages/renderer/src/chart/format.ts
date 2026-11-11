import type { ChartFormat } from './spec'

const COMPACT_STEPS: [number, string][] = [
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'k'],
]
const validDecimals = (decimals: unknown): decimals is number => typeof decimals === 'number' && Number.isInteger(decimals) && decimals >= 0 && decimals <= 20

const PREFIX_UNITS = new Set(['$', '¥', '€', '£'])
const ATTACHED_UNITS = new Set(['%', '×', 'x'])

/** A value: 1.2k, −12, $12, 12%, 12 ms. */
export function formatChartValue(value: number | null | undefined, format: ChartFormat = {}): string {
  if (value == null || Number.isNaN(value))
    return '—'
  const abs = Math.abs(value)
  const step = format.compact !== false
    ? COMPACT_STEPS.find(([size]) => abs >= size)
    : undefined
  let body: string
  if (step) {
    const amount = abs / step[0]
    // Decimals asked for apply to the short form too: 1.23k.
    body = (validDecimals(format.decimals)
      ? amount.toFixed(format.decimals)
      : (amount < 10
          ? amount.toFixed(1)
          : String(Math.round(amount))).replace(/\.0$/, '')) + step[1]
  }
  else if (validDecimals(format.decimals)) {
    body = abs.toFixed(format.decimals)
  }
  else {
    body = String(+abs.toFixed(2))
  }
  const sign = value < 0
    ? '−'
    : format.signed && value > 0
      ? '+'
      : ''
  const unit = typeof format.unit === 'string'
    ? format.unit
    : ''
  if (!unit)
    return sign + body
  if (PREFIX_UNITS.has(unit))
    return sign + unit + body
  if (ATTACHED_UNITS.has(unit))
    return sign + body + unit
  return `${sign}${body} ${unit}`
}

/** Units short enough to sit by every number: `$12`, `12%`. Longer ones go above the axis once. */
export function isShortUnit(unit: unknown): boolean {
  return typeof unit === 'string' && (PREFIX_UNITS.has(unit) || ATTACHED_UNITS.has(unit))
}

// The fewest decimals that show a number exactly, as it is written (after any k, M or B).
function neededDecimals(value: number, compact: boolean): number {
  const abs = Math.abs(value)
  const step = compact
    ? COMPACT_STEPS.find(([size]) => abs >= size)
    : undefined
  const amount = step
    ? abs / step[0]
    : abs
  for (let decimals = 0; decimals < 6; decimals++) {
    if (Math.abs(+amount.toFixed(decimals) - amount) < 1e-9 * Math.max(1, amount))
      return decimals
  }
  return 6
}

/**
 * An axis label: no sign, the unit only where asked, and only the decimals the tick needs.
 * Ticks are round numbers, so the decimals asked for (meant for values) would only add 0s.
 */
export function formatTick(value: number, format: ChartFormat = {}, withUnit = false): string {
  return formatChartValue(value, {
    ...format,
    decimals: neededDecimals(value, format.compact !== false),
    signed: false,
    unit: withUnit ? format.unit : undefined,
  })
}
