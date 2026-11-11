import type { ChartSpec } from './spec'
import type { ChartLayout } from './svg'
import { formatChartValue } from './format'
import { CHART_PALETTE_SIZE } from './spec'

export interface ChartHoverRow {
  label: string
  value: string
  color: number
  muted: boolean
  /** Only for pie slices. */
  percent?: number
}

/** What a tooltip shows for one category or slice, worked out from the layout. */
export interface ChartHover {
  index: number
  title: string
  rows: ChartHoverRow[]
  /** For stacked charts: the category's sum. */
  total?: string
  /** Where it points, in the drawing's coordinates. */
  x: number
  /** Which side of `x` there is room on. */
  side: 'left' | 'right'
}

function finite(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : null
}

/** The category nearest `x`, or `null` outside the plot. */
export function nearestCategory(layout: ChartLayout, x: number): number | null {
  if (!layout.categories.length || x < layout.plot.left || x > layout.plot.right)
    return null
  let best = 0
  layout.categories.forEach((category, index) => {
    if (Math.abs(category.x - x) < Math.abs(layout.categories[best].x - x))
      best = index
  })
  return best
}

/** The pie row whose slice is at a point, or `null` off the pie and in a donut's hole. */
export function sliceAt(layout: ChartLayout, x: number, y: number): number | null {
  if (!layout.pie)
    return null
  const { cx, cy, r, inner } = layout.pie
  const distance = Math.hypot(x - cx, y - cy)
  if (distance > r || distance < inner)
    return null
  // Clockwise from the top, as the slices are drawn.
  let angle = Math.atan2(x - cx, cy - y)
  if (angle < 0)
    angle += Math.PI * 2
  return layout.slices.find(slice => angle >= slice.start && angle < slice.end)?.row ?? null
}

export function chartHover(spec: ChartSpec, layout: ChartLayout, index: number): ChartHover | null {
  const format = typeof spec.format === 'object' && spec.format !== null
    ? spec.format
    : {}
  if (spec.type === 'pie') {
    const slice = layout.slices.find(item => item.row === index)
    if (!slice)
      return null
    const label = slice.row === -1
      ? `${slice.label}（${slice.members} 項）`
      : slice.label
    const x = layout.pie!.cx
    return {
      index,
      title: label,
      rows: [
        {
          label,
          value: formatChartValue(slice.value, format),
          color: slice.color,
          muted: slice.muted,
          percent: slice.percent,
        },
      ],
      x,
      side: 'right',
    }
  }
  const row = spec.data[index]
  const category = layout.categories[index]
  if (!row || !category)
    return null
  let rows = spec.series.map((series, position) => {
    const color = Number.isInteger(series.color) && series.color! >= 1 && series.color! <= CHART_PALETTE_SIZE
      ? series.color!
      : (position % CHART_PALETTE_SIZE) + 1
    return {
      label: series.label || series.key,
      value: formatChartValue(finite(row[series.key]), format),
      raw: finite(row[series.key]),
      color,
      muted: typeof spec.highlight === 'string' && spec.highlight !== series.key,
    }
  })
  // Lines cross: largest first reads like the chart. Bars keep the legend's order.
  if (spec.type !== 'bar')
    rows = [...rows].sort((a, b) => (b.raw ?? Number.NEGATIVE_INFINITY) - (a.raw ?? Number.NEGATIVE_INFINITY))
  const stacked = spec.stacked === true && (spec.type === 'bar' || spec.type === 'area')
  return {
    index,
    title: category.label,
    rows: rows.map(({ raw: _raw, ...rest }) => rest),
    ...(stacked
      ? {
          total: formatChartValue(rows.reduce((sum, item) => sum + (item.raw ?? 0), 0), format),
        }
      : {}),
    x: category.x,
    side: category.x > (layout.plot.left + layout.plot.right) / 2
      ? 'left'
      : 'right',
  }
}
