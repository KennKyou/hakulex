import type { ChartSpec } from '../src'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { formatChartValue, RichRenderer, validateChartSpec } from '../src'
import { chartHover } from '../src/chart/hover'
import { chartLegend, layoutChart, WIDE_LAYOUT } from '../src/chart/svg'

function pie(values: number[], extra: Partial<ChartSpec> = {}): ChartSpec {
  return {
    version: 1,
    type: 'pie',
    x: 'k',
    series: [
      { key: 'v' },
    ],
    data: values.map((v, i) => ({ k: `s${i}`, v })),
    ...extra,
  }
}
const percents = (spec: ChartSpec) => layoutChart(spec, WIDE_LAYOUT).slices.map(slice => slice.percent)
function ssr(spec: ChartSpec) {
  return renderToString(createSSRApp({
    render: () => h(RichRenderer, {
      value: {
        root: {
          type: 'root',
          children: [
            {
              type: 'chart',
              spec: JSON.stringify(spec),
            },
          ],
        },
      } as never,
    }),
  }))
}

describe('pie percentages', () => {
  it.each([
    [
      [1, 1, 1],
      [34, 33, 33],
    ],
    [
      [1, 2, 3, 4, 5, 6],
      [5, 9, 14, 19, 24, 29],
    ],
    [
      [62, 21, 9, 8],
      [62, 21, 9, 8],
    ],
    [
      [1, 1, 1, 1, 1, 1],
      [17, 17, 17, 17, 16, 16],
    ],
  ])('shares %j out as %j, always 100 in all', (values, expected) => {
    const shown = percents(pie(values))
    expect(shown).toEqual(expected)
    expect(shown.reduce((sum, value) => sum + value, 0)).toBe(100)
  })

  it('tells the same share in the tip and a donut\'s middle', async () => {
    const spec = pie([1, 1, 1], { donut: true })
    const layout = layoutChart(spec, WIDE_LAYOUT)
    expect(chartHover(spec, layout, 0)!.rows[0].percent).toBe(34)
  })
})

describe('a pie with more than six rows', () => {
  const big = pie([40, 5, 30, 1, 20, 2, 10, 3])

  it('is not an error', () => {
    expect(validateChartSpec(big).ok).toBe(true)
  })

  it('keeps the five largest in their order and adds up the rest as one gray slice, last', () => {
    const slices = layoutChart(big, WIDE_LAYOUT).slices
    expect(slices.map(slice => slice.label)).toEqual(['s0', 's1', 's2', 's4', 's6', '其他'])
    const other = slices.at(-1)!
    expect(other.row).toBe(-1)
    expect(other.color).toBe(0)
    expect(slices.reduce((sum, slice) => sum + slice.percent, 0)).toBe(100)
    expect(other.percent).toBe(5)
  })

  it('says what the other slice holds', () => {
    const tip = chartHover(big, layoutChart(big, WIDE_LAYOUT), -1)!
    expect(tip.rows[0]).toMatchObject({ label: '其他（3 項）', value: '6' })
  })

  it('lists the merged slice in the legend, and every row in the table', async () => {
    expect(chartLegend(big).map(item => item.label)).toEqual(['s0', 's1', 's2', 's4', 's6', '其他'])
    const html = await ssr(big)
    expect(html.match(/<tbody>[\s\S]*?<\/tbody>/)![0].match(/<tr/g)).toHaveLength(8)
    expect(html).toContain('hlx-chart-c0')
  })
})

describe('decimals and abbreviations', () => {
  it.each([
    [
      1234.5678,
      { decimals: 2 },
      '1.23k',
    ],
    [
      1234.5678,
      { decimals: 0 },
      '1k',
    ],
    [
      1200,
      { decimals: 2 },
      '1.20k',
    ],
    [
      1234.5678,
      { decimals: 2, compact: false },
      '1234.57',
    ],
    [1234.5678, {}, '1.2k'],
    [
      12_345_678,
      { decimals: 1 },
      '12.3M',
    ],
  ] as const)('shows %j with %j as %s', (value, format, shown) => {
    expect(formatChartValue(value, format)).toBe(shown)
  })

  it('shows the decimals in the tip and the table, and round ticks without them', async () => {
    const spec: ChartSpec = {
      version: 1,
      type: 'bar',
      x: 'k',
      format: { decimals: 1 },
      series: [
        { key: 'a' },
      ],
      data: [
        { k: 'one', a: 1234 },
        { k: 'two', a: 2600 },
      ],
    }
    const layout = layoutChart(spec, WIDE_LAYOUT)
    const labels = layout.ticks.map(tick => tick.label)
    expect(labels).toContain('0')
    expect(labels).toContain('1k')
    expect(labels.some(label => label.endsWith('.0') || label.includes('.0k'))).toBe(false)
    expect(chartHover(spec, layout, 0)!.rows[0].value).toBe('1.2k')
    expect(await ssr(spec)).toContain('<td>1.2k</td>')
  })

  it('keeps the digits a tick needs', () => {
    const spec: ChartSpec = {
      version: 1,
      type: 'bar',
      x: 'k',
      format: { decimals: 0 },
      series: [
        { key: 'a' },
      ],
      data: [
        { k: 'one', a: 0.3 },
        { k: 'two', a: 0.9 },
      ],
    }
    const labels = layoutChart(spec, WIDE_LAYOUT).ticks.map(tick => tick.label)
    expect(labels).toContain('0.2')
    expect(new Set(labels).size).toBe(labels.length)
  })
})

describe('units on the axis', () => {
  const bar = (unit: string): ChartSpec => ({
    version: 1,
    type: 'bar',
    x: 'k',
    format: { unit },
    series: [
      { key: 'a' },
    ],
    data: [
      { k: 'one', a: 30 },
      { k: 'two', a: 80 },
    ],
  })

  it.each(['%', '$'])('puts a short unit like %s on every tick', (unit) => {
    const layout = layoutChart(bar(unit), WIDE_LAYOUT)
    expect(layout.ticks.every(tick => tick.label.includes(unit))).toBe(true)
    expect(layout.unitCaption).toBeUndefined()
  })

  it('puts a longer unit above the axis once, and keeps it with every value in the tip', async () => {
    const layout = layoutChart(bar('ms'), WIDE_LAYOUT)
    expect(layout.ticks.some(tick => tick.label.includes('ms'))).toBe(false)
    expect(layout.unitCaption).toBe('單位：ms')
    expect(chartHover(bar('ms'), layout, 0)!.rows[0].value).toBe('30 ms')
    expect(await ssr(bar('ms'))).toContain('單位：ms')
  })
})

describe('colors outside a chart', () => {
  it('defines the palette on the whole content, so dialogs can use it', async () => {
    const { readFileSync } = await import('node:fs')
    const css = readFileSync(`${process.cwd()}/packages/style-token/src/content.css`, 'utf8')
    expect(css).toMatch(/\.hlx-root \{[^}]*--hlx-chart-1:/)
    expect(css).toMatch(/\.hlx-root\[data-color-scheme='dark'\] \{[^}]*--hlx-chart-1:/)
  })
})
