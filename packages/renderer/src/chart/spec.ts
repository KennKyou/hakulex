/** A chart, independent of any charting library: what a chart node stores in `spec`. */
export type ChartType = 'bar' | 'line' | 'area' | 'pie'
export type ChartValue = string | number | null
export type ChartRow = Record<string, ChartValue>

export interface ChartSeries {
  key: string
  label?: string
  /** Which palette color, 1 to 6. */
  color?: number
}

export interface ChartFormat {
  unit?: string
  /** 1.2k, 3.4M. On unless false. */
  compact?: boolean
  decimals?: number
  signed?: boolean
}

export interface ChartReferenceLine {
  y: number
  label: string
}

export interface ChartSpec {
  version: 1
  type: ChartType
  x: string
  series: ChartSeries[]
  data: ChartRow[]
  title?: string
  subtitle?: string
  xLabel?: string
  source?: string
  note?: string
  format?: ChartFormat
  y?: { min?: number, max?: number }
  refs?: ChartReferenceLine[]
  /** A series key, or for a pie, a category. The rest go gray. */
  highlight?: string
  stacked?: boolean
  donut?: boolean
}

export interface ChartIssue {
  /** Where in the spec, such as `data[2].before`. */
  path: string
  message: string
  hint?: string
}

export type ChartValidation = { ok: true, spec: ChartSpec } | { ok: false, issues: ChartIssue[] }

export const CHART_TYPES: readonly ChartType[] = ['bar', 'line', 'area', 'pie']
export const CHART_PALETTE_SIZE = 6

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function describe(value: unknown): string {
  if (value === undefined)
    return '沒有值'
  return JSON.stringify(value) ?? String(value)
}

/** A stored `spec`: a JSON string, or the object itself. */
export function parseChartSource(source: unknown): ChartValidation {
  if (typeof source !== 'string')
    return validateChartSpec(source)
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  }
  catch (error) {
    return {
      ok: false,
      issues: [
        { path: '(root)', message: `不是合法的 JSON：${(error as Error).message}` },
      ],
    }
  }
  return validateChartSpec(parsed)
}

/** The same rules, every problem at once. */
export function validateChartSpec(input: unknown): ChartValidation {
  const issues: ChartIssue[] = []
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [
        { path: '(root)', message: '必須是物件' },
      ],
    }
  }
  const { type, x, series, data } = input
  if (!CHART_TYPES.includes(type as ChartType))
    issues.push({ path: 'type', message: `是 ${describe(type)}，不支援`, hint: `請使用：${CHART_TYPES.join('、')}` })
  if (typeof x !== 'string' || !x)
    issues.push({ path: 'x', message: '必須是分類所用的欄位名稱' })
  if (!Array.isArray(series) || !series.length)
    issues.push({ path: 'series', message: '必須是非空的陣列，每項是 { key, label? }' })
  if (!Array.isArray(data))
    issues.push({ path: 'data', message: '必須是資料列的陣列' })
  if (issues.some(issue => issue.path !== 'type'))
    return { ok: false, issues }

  const rows = data as unknown[]
  const seriesList = series as unknown[]
  const fields = new Set<string>()
  rows.forEach((row, index) => {
    if (!isRecord(row)) {
      issues.push({ path: `data[${index}]`, message: '必須是物件' })
      return
    }
    for (const key of Object.keys(row))
      fields.add(key)
  })
  if (seriesList.length > CHART_PALETTE_SIZE)
    issues.push({ path: 'series', message: `有 ${seriesList.length} 個，最多 ${CHART_PALETTE_SIZE} 個`, hint: '把最小的幾個合併成「其他」，或拆成幾張圖' })

  const known = [...fields].map(field => `"${field}"`).join('、') || '（沒有）'
  if (rows.length && !fields.has(x as string))
    issues.push({ path: 'x', message: `是 ${describe(x)}，但沒有資料列有這個欄位`, hint: `資料裡有的欄位：${known}` })

  const keys: string[] = []
  seriesList.forEach((item, index) => {
    if (!isRecord(item) || typeof item.key !== 'string' || !item.key) {
      issues.push({ path: `series[${index}]`, message: '必須是 { key: string, label?: string }' })
      return
    }
    keys.push(item.key)
    if (rows.length && !fields.has(item.key))
      issues.push({ path: `series[${index}].key`, message: `是 ${describe(item.key)}，但沒有資料列有這個欄位`, hint: `資料裡有的欄位：${known}` })
  })

  rows.forEach((row, index) => {
    if (!isRecord(row))
      return
    for (const key of keys) {
      const value = row[key]
      if (value === null || value === undefined)
        continue
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        issues.push({
          path: `data[${index}].${key}`,
          message: `必須是數字，現在是 ${describe(value)}`,
          ...(typeof value === 'string' && /\d/.test(value)
            ? { hint: '只寫數字，單位放在 format.unit' }
            : {}),
        })
      }
    }
  })

  if (type === 'pie') {
    const key = keys[0]
    rows.forEach((row, index) => {
      if (isRecord(row) && typeof row[key] === 'number' && (row[key] as number) < 0)
        issues.push({ path: `data[${index}].${key}`, message: '是負數，圓餅的每一片都要大於或等於 0' })
    })
  }

  if (input.highlight !== undefined && typeof input.highlight !== 'string')
    issues.push({ path: 'highlight', message: '必須是字串' })
  else if (typeof input.highlight === 'string' && type !== 'pie' && !keys.includes(input.highlight))
    issues.push({ path: 'highlight', message: `是 ${describe(input.highlight)}，不是任何 series 的 key`, hint: `series 的 key：${keys.map(key => `"${key}"`).join('、')}` })

  return issues.length
    ? { ok: false, issues }
    : {
        ok: true,
        spec: { ...(input as unknown as ChartSpec), version: 1 },
      }
}
