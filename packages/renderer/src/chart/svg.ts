import type { VNode } from 'vue'
import type { ChartFormat, ChartSpec } from './spec'
import { h } from 'vue'
import { formatChartValue, formatTick, isShortUnit } from './format'
import { bandScale, linearScale, niceTicks } from './scale'
import { CHART_PALETTE_SIZE } from './spec'

/**
 * Charts are drawn twice, wide and compact, and CSS shows the one that fits: on the
 * server nobody knows the width. Everything below comes from the spec alone.
 */
export interface ChartSize { width: number, height: number, compact: boolean }
export const WIDE_LAYOUT: ChartSize = { width: 720, height: 300, compact: false }
export const COMPACT_LAYOUT: ChartSize = { width: 340, height: 240, compact: true }

const FONT_SIZE = 12
const TOP = 12
const RIGHT = 12
const BOTTOM = 24

interface Mark { key: string, color: number, muted: boolean }
export interface ChartLayout extends ChartSize {
  zeroY: number
  plot: { left: number, right: number, top: number, bottom: number }
  ticks: { value: number, label: string, y: number }[]
  categories: { label: string, x: number, shown: boolean }[]
  /** Space per category, for marking the one under the pointer. */
  step: number
  bars: (Mark & { x: number, y: number, width: number, height: number })[]
  lines: (Mark & { path: string, dots: [number, number][], points: ([number, number] | null)[] })[]
  areas: (Mark & { path: string })[]
  /** `row` is the data row, or -1 for the slice that adds up the smallest rows. */
  slices: { row: number, label: string, value: number, members: number, path: string, start: number, end: number, percent: number, color: number, muted: boolean, labelAt: [number, number] }[]
  pie?: { cx: number, cy: number, r: number, inner: number }
  refs: { y: number, label: string }[]
  /** A unit too long for every tick, shown once above the axis. */
  unitCaption?: string
}

/** Text is not measured on the server, so its width is estimated: CJK takes a full em. */
const NARROW = new Set([
  '.',
  ',',
  ':',
  ';',
  '!',
  '|',
  'i',
  'l',
  '1',
  ' ',
  '\'',
  '-',
])
const WIDE = new Set(['%', 'M', 'W', 'm', 'w', '@'])

/**
 * Widths differ by font and browser (Firefox draws these a little wider), so this errs on the
 * wide side: the axis then has room for its labels rather than letting them spill out.
 */
export function estimateTextWidth(text: string, fontSize = FONT_SIZE): number {
  let width = 0
  for (const char of text) {
    if (char.charCodeAt(0) > 0x2E80)
      width += fontSize
    else if (NARROW.has(char))
      width += fontSize * 0.35
    else if (WIDE.has(char))
      width += fontSize * 0.9
    else
      width += fontSize * 0.62
  }
  return width * 1.15
}

const round = (value: number) => Math.round(value * 100) / 100
const point = ([x, y]: [number, number]) => `${round(x)},${round(y)}`
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
function finite(value: unknown) {
  return isNumber(value)
    ? value
    : undefined
}

function colorOf(series: { color?: number }, index: number): number {
  const color = series.color
  return Number.isInteger(color) && color! >= 1 && color! <= CHART_PALETTE_SIZE
    ? color!
    : (index % CHART_PALETTE_SIZE) + 1
}

function formatOf(spec: ChartSpec): ChartFormat {
  return typeof spec.format === 'object' && spec.format !== null
    ? spec.format
    : {}
}

export function layoutChart(spec: ChartSpec, size: ChartSize): ChartLayout {
  const base: ChartLayout = {
    ...size,
    zeroY: 0,
    plot: {
      left: 0,
      right: size.width,
      top: TOP,
      bottom: size.height,
    },
    ticks: [],
    categories: [],
    step: 0,
    bars: [],
    lines: [],
    areas: [],
    slices: [],
    refs: [],
  }
  return spec.type === 'pie'
    ? layoutPie(spec, base)
    : layoutAxes(spec, base)
}

export interface PieSlice { row: number, label: string, value: number, members: number, color: number }

/**
 * The slices a pie shows. Past six rows, the five largest stay in their order and the rest
 * add up to one gray slice, last: more colors than that can't be told apart.
 */
export function pieSlices(spec: ChartSpec): PieSlice[] {
  const key = spec.series[0]?.key
  const rows = spec.data
    .map((row, index) => ({
      row: index,
      label: String(row[spec.x] ?? ''),
      value: Math.max(0, (key
        ? finite(row[key])
        : undefined) ?? 0),
      members: 1,
      color: (index % CHART_PALETTE_SIZE) + 1,
    }))
    .filter(slice => slice.value > 0)
  if (rows.length <= CHART_PALETTE_SIZE)
    return rows
  const largest = new Set([...rows].sort((a, b) => b.value - a.value).slice(0, CHART_PALETTE_SIZE - 1).map(slice => slice.row))
  const rest = rows.filter(slice => !largest.has(slice.row))
  return [
    ...rows.filter(slice => largest.has(slice.row)).map((slice, index) => ({ ...slice, color: index + 1 })),
    {
      row: -1,
      label: '其他',
      value: rest.reduce((sum, slice) => sum + slice.value, 0),
      members: rest.length,
      color: 0,
    },
  ]
}

/** Whole percentages adding up to 100: the points rounding left over go to the largest remainders. */
export function wholePercents(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0)
  if (total <= 0)
    return values.map(() => 0)
  const exact = values.map(value => value / total * 100)
  const shares = exact.map(Math.floor)
  let left = 100 - shares.reduce((sum, share) => sum + share, 0)
  const order = exact.map((value, index) => ({ index, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest || a.index - b.index)
  for (const { index } of order) {
    if (left <= 0)
      break
    shares[index]++
    left--
  }
  return shares
}

function layoutPie(spec: ChartSpec, layout: ChartLayout): ChartLayout {
  const shown = pieSlices(spec)
  const total = shown.reduce((sum, slice) => sum + slice.value, 0)
  const percents = wholePercents(shown.map(slice => slice.value))
  const cx = layout.width / 2
  const cy = layout.height / 2
  const r = Math.min(layout.width, layout.height) / 2 - 8
  const inner = spec.donut
    ? r * 0.62
    : 0
  layout.pie = { cx, cy, r, inner }
  if (total <= 0)
    return layout
  const at = (angle: number, radius: number): [number, number] => [cx + radius * Math.sin(angle), cy - radius * Math.cos(angle)]
  let start = 0
  shown.forEach((slice, index) => {
    const value = slice.value
    const end = start + value / total * Math.PI * 2
    const large = end - start > Math.PI
      ? 1
      : 0
    let path: string
    if (end - start >= Math.PI * 2 - 1e-9) {
      // A full circle can't be one arc: draw it as two halves.
      path = `M${point(at(0, r))} A${round(r)},${round(r)} 0 1 1 ${point(at(Math.PI, r))} A${round(r)},${round(r)} 0 1 1 ${point(at(0, r))} Z`
      if (inner)
        path += ` M${point(at(0, inner))} A${round(inner)},${round(inner)} 0 1 0 ${point(at(Math.PI, inner))} A${round(inner)},${round(inner)} 0 1 0 ${point(at(0, inner))} Z`
    }
    else if (inner) {
      path = `M${point(at(start, r))} A${round(r)},${round(r)} 0 ${large} 1 ${point(at(end, r))} L${point(at(end, inner))} A${round(inner)},${round(inner)} 0 ${large} 0 ${point(at(start, inner))} Z`
    }
    else {
      path = `M${point([cx, cy])} L${point(at(start, r))} A${round(r)},${round(r)} 0 ${large} 1 ${point(at(end, r))} Z`
    }
    layout.slices.push({
      row: slice.row,
      label: slice.label,
      value,
      members: slice.members,
      path,
      start,
      end,
      percent: percents[index],
      color: slice.color,
      muted: typeof spec.highlight === 'string' && spec.highlight !== slice.label,
      labelAt: at((start + end) / 2, inner
        ? (r + inner) / 2
        : r * 0.65),
    })
    start = end
  })
  return layout
}

function layoutAxes(spec: ChartSpec, layout: ChartLayout): ChartLayout {
  const format = formatOf(spec)
  const stacked = spec.stacked === true && (spec.type === 'bar' || spec.type === 'area')
  const values: number[] = []
  for (const row of spec.data) {
    if (stacked) {
      let up = 0
      let down = 0
      for (const series of spec.series) {
        const value = finite(row[series.key]) ?? 0
        if (value >= 0)
          up += value
        else
          down += value
      }
      values.push(up, down)
    }
    else {
      for (const series of spec.series) {
        const value = finite(row[series.key])
        if (value !== undefined)
          values.push(value)
      }
    }
  }
  const refs = Array.isArray(spec.refs)
    ? spec.refs.filter(ref => isNumber(ref?.y))
    : []
  const bounds = typeof spec.y === 'object' && spec.y !== null
    ? spec.y
    : {}
  const lo = Math.min(0, ...values, ...refs.map(ref => ref.y), finite(bounds.min) ?? 0)
  const hi = Math.max(0, ...values, ...refs.map(ref => ref.y), finite(bounds.max) ?? 0)
  const tickValues = niceTicks(lo, hi === lo
    ? lo + 1
    : hi, layout.compact ? 3 : 4)
  const domain: [number, number] = [
    tickValues[0],
    tickValues.at(-1)!,
  ]
  // A short unit sits by every tick; a longer one is said once, above the axis.
  const short = isShortUnit(format.unit)
  const labels = tickValues.map(value => formatTick(value, format, short))
  if (!short && typeof format.unit === 'string' && format.unit.trim())
    layout.unitCaption = `單位：${format.unit.trim()}`
  const left = Math.ceil(Math.max(...labels.map(label => estimateTextWidth(label)))) + 10
  const plot = {
    left,
    right: layout.width - RIGHT,
    top: layout.unitCaption
      ? TOP + 14
      : TOP,
    bottom: layout.height - BOTTOM,
  }
  layout.plot = plot
  const y = linearScale(domain, [plot.bottom, plot.top])
  layout.zeroY = y(0)
  layout.ticks = tickValues.map((value, index) => ({
    value,
    label: labels[index],
    y: y(value),
  }))
  layout.refs = refs.map(ref => ({
    y: y(ref.y),
    label: typeof ref.label === 'string'
      ? ref.label
      : '',
  }))

  const band = bandScale(spec.data.length, [plot.left, plot.right])
  const names = spec.data.map(row => String(row[spec.x] ?? ''))
  const widest = Math.max(1, ...names.map(name => estimateTextWidth(name)))
  const fit = Math.max(1, Math.floor((plot.right - plot.left) / (widest + 8)))
  const every = Math.ceil(names.length / fit)
  layout.categories = names.map((label, index) => ({
    label,
    x: band.center(index),
    shown: index % every === 0,
  }))
  layout.step = band.step

  const marks = spec.series.map((series, index) => ({
    key: series.key,
    color: colorOf(series, index),
    muted: typeof spec.highlight === 'string' && spec.highlight !== series.key,
  }))

  if (spec.type === 'bar') {
    spec.data.forEach((row, rowIndex) => {
      let up = 0
      let down = 0
      const width = stacked
        ? band.bandwidth
        : band.bandwidth / marks.length
      marks.forEach((mark, index) => {
        const value = finite(row[mark.key])
        if (value === undefined)
          return
        const x = band.start(rowIndex) + (stacked
          ? 0
          : index * width)
        let from = 0
        if (stacked) {
          from = value >= 0
            ? up
            : down
          if (value >= 0)
            up += value
          else
            down += value
        }
        const a = y(from)
        const b = y(from + value)
        layout.bars.push({
          ...mark,
          x,
          y: Math.min(a, b),
          width,
          height: Math.abs(b - a),
        })
      })
    })
    return layout
  }

  const xs = spec.data.map((_, index) => band.center(index))
  if (spec.type === 'area' && stacked) {
    let lower = spec.data.map(() => 0)
    for (const mark of marks) {
      const upper = spec.data.map((row, index) => lower[index] + (finite(row[mark.key]) ?? 0))
      const top = xs.map((x, index): [number, number] => [
        x,
        y(upper[index]),
      ])
      const bottom = xs.map((x, index): [number, number] => [
        x,
        y(lower[index]),
      ]).reverse()
      layout.areas.push({ ...mark, path: `M${top.map(point).join(' L')} L${bottom.map(point).join(' L')} Z` })
      layout.lines.push({
        ...mark,
        path: `M${top.map(point).join(' L')}`,
        dots: [],
        points: top,
      })
      lower = upper
    }
    return layout
  }

  for (const mark of marks) {
    // A missing value breaks the line rather than dropping to zero.
    const segments: [number, number][][] = []
    const points: ([number, number] | null)[] = []
    let current: [number, number][] = []
    spec.data.forEach((row, index) => {
      const value = finite(row[mark.key])
      points.push(value === undefined
        ? null
        : [
            xs[index],
            y(value),
          ])
      if (value === undefined) {
        if (current.length)
          segments.push(current)
        current = []
        return
      }
      current.push([
        xs[index],
        y(value),
      ])
    })
    if (current.length)
      segments.push(current)
    layout.lines.push({
      ...mark,
      path: segments.map(segment => `M${segment.map(point).join(' L')}`).join(' '),
      dots: segments.filter(segment => segment.length === 1).map(segment => segment[0]),
      points,
    })
    if (spec.type === 'area') {
      for (const segment of segments) {
        const zero = layout.zeroY
        layout.areas.push({ ...mark, path: `M${segment.map(point).join(' L')} L${point([segment.at(-1)![0], zero])} L${point([segment[0][0], zero])} Z` })
      }
    }
  }
  return layout
}

const markClass = (color: number) => `hlx-chart-c${color}`

/** One drawing of the chart, at one size; `hover` is the category or pie row under the pointer. */
export function renderChartSvg(spec: ChartSpec, size: ChartSize, label: string, hover: number | null = null): VNode {
  const layout = layoutChart(spec, size)
  const { plot } = layout
  const children: (VNode | null)[] = [
    h('title', label),
  ]
  if (layout.pie) {
    for (const slice of layout.slices) {
      children.push(h('path', {
        'class': [
          'hlx-chart-mark',
          markClass(slice.color),
        ],
        'd': slice.path,
        'data-index': slice.row,
        'data-muted': slice.muted || undefined,
        'data-dimmed': hover !== null && hover !== slice.row
          ? true
          : undefined,
      }))
      if (slice.percent >= 5) {
        children.push(h('text', {
          'class': 'hlx-chart-slice-label',
          'x': round(slice.labelAt[0]),
          'y': round(slice.labelAt[1]),
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
        }, `${slice.percent}%`))
      }
    }
    if (spec.donut && layout.pie && layout.slices.length) {
      const format = typeof spec.format === 'object' && spec.format !== null
        ? spec.format
        : {}
      const slice = hover === null
        ? undefined
        : layout.slices.find(item => item.row === hover)
      const total = layout.slices.reduce((sum, item) => sum + item.value, 0)
      const [first, second] = slice
        ? [
            `${slice.label} · ${slice.percent}%`,
            formatChartValue(slice.value, format),
          ]
        : [
            '總計',
            formatChartValue(total, format),
          ]
      children.push(h('text', {
        'class': 'hlx-chart-center',
        'x': round(layout.pie.cx),
        'y': round(layout.pie.cy),
        'text-anchor': 'middle',
      }, [
        h('tspan', {
          class: 'hlx-chart-center-label',
          x: round(layout.pie.cx),
          dy: '-0.4em',
        }, first),
        h('tspan', {
          class: 'hlx-chart-center-value',
          x: round(layout.pie.cx),
          dy: '1.3em',
        }, second),
      ]))
    }
  }
  else {
    for (const tick of layout.ticks) {
      children.push(h('line', {
        class: tick.value === 0
          ? 'hlx-chart-zero'
          : 'hlx-chart-grid',
        x1: plot.left,
        x2: plot.right,
        y1: round(tick.y),
        y2: round(tick.y),
      }))
      children.push(h('text', {
        'class': 'hlx-chart-tick',
        'x': plot.left - 6,
        'y': round(tick.y),
        'text-anchor': 'end',
        'dominant-baseline': 'middle',
      }, tick.label))
    }
    if (hover !== null && spec.type === 'bar' && layout.categories[hover]) {
      children.push(h('rect', {
        class: 'hlx-chart-hover-band',
        x: round(layout.categories[hover].x - layout.step / 2),
        y: plot.top,
        width: round(layout.step),
        height: round(plot.bottom - plot.top),
      }))
    }
    for (const area of layout.areas) {
      children.push(h('path', {
        'class': [
          'hlx-chart-area',
          markClass(area.color),
        ],
        'd': area.path,
        'data-muted': area.muted || undefined,
      }))
    }
    for (const bar of layout.bars) {
      children.push(h('rect', {
        'class': [
          'hlx-chart-mark',
          markClass(bar.color),
        ],
        'x': round(bar.x),
        'y': round(bar.y),
        'width': round(bar.width),
        'height': round(bar.height),
        'data-muted': bar.muted || undefined,
      }))
    }
    for (const line of layout.lines) {
      children.push(h('path', {
        'class': [
          'hlx-chart-line',
          markClass(line.color),
        ],
        'd': line.path,
        'data-muted': line.muted || undefined,
      }))
      for (const [x, y] of line.dots) {
        children.push(h('circle', {
          'class': [
            'hlx-chart-mark',
            markClass(line.color),
          ],
          'cx': round(x),
          'cy': round(y),
          'r': 3,
          'data-muted': line.muted || undefined,
        }))
      }
    }
    if (hover !== null && spec.type !== 'bar' && layout.categories[hover]) {
      const x = round(layout.categories[hover].x)
      children.push(h('line', {
        class: 'hlx-chart-hover-guide',
        x1: x,
        x2: x,
        y1: plot.top,
        y2: plot.bottom,
      }))
      for (const line of layout.lines) {
        const at = line.points[hover]
        if (at) {
          children.push(h('circle', {
            'class': [
              'hlx-chart-hover-point',
              markClass(line.color),
            ],
            'cx': round(at[0]),
            'cy': round(at[1]),
            'r': 4,
            'data-muted': line.muted || undefined,
          }))
        }
      }
    }
    for (const ref of layout.refs) {
      children.push(h('line', {
        class: 'hlx-chart-ref',
        x1: plot.left,
        x2: plot.right,
        y1: round(ref.y),
        y2: round(ref.y),
      }))
      children.push(h('text', {
        'class': 'hlx-chart-ref-label',
        'x': plot.right,
        'y': round(ref.y) - 4,
        'text-anchor': 'end',
      }, ref.label))
    }
    if (layout.unitCaption) {
      children.push(h('text', {
        'class': 'hlx-chart-tick',
        'x': plot.left - 6,
        'y': TOP,
        'text-anchor': 'start',
        'dominant-baseline': 'middle',
      }, layout.unitCaption))
    }
    for (const category of layout.categories) {
      if (category.shown) {
        children.push(h('text', {
          'class': 'hlx-chart-category',
          'x': round(category.x),
          'y': layout.height - 8,
          'text-anchor': 'middle',
        }, category.label))
      }
    }
  }
  return h('svg', {
    'class': 'hlx-chart-svg',
    'data-size': size.compact ? 'compact' : 'wide',
    'viewBox': `0 0 ${size.width} ${size.height}`,
    'role': 'img',
    'aria-label': label,
  }, children)
}

/** What the legend lists: series, or for a pie, its slices. */
export function chartLegend(spec: ChartSpec): { label: string, color: number, muted: boolean }[] {
  if (spec.type === 'pie') {
    return pieSlices(spec).map(slice => ({ label: slice.label, color: slice.color, muted: typeof spec.highlight === 'string' && spec.highlight !== slice.label }))
  }
  return spec.series.map((series, index) => ({
    label: series.label || series.key,
    color: colorOf(series, index),
    muted: typeof spec.highlight === 'string' && spec.highlight !== series.key,
  }))
}
