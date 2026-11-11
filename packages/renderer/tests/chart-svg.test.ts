import type { ChartSpec } from '../src'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { RichRenderer } from '../src'
import { bandScale, linearScale, niceTicks } from '../src/chart/scale'
import { COMPACT_LAYOUT, layoutChart, WIDE_LAYOUT } from '../src/chart/svg'

function spec(extra: Partial<ChartSpec>): ChartSpec {
  return {
    version: 1,
    type: 'bar',
    x: 'k',
    series: [
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' },
    ],
    data: [
      { k: 'one', a: 10, b: 20 },
      { k: 'two', a: 30, b: -10 },
    ],
    ...extra,
  }
}
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.01)

describe('scales', () => {
  it('chooses round ticks that cover the values', () => {
    expect(niceTicks(0, 87, 4)).toEqual([0, 20, 40, 60, 80, 100])
    expect(niceTicks(-12, 30, 4)).toEqual([-20, -10, 0, 10, 20, 30])
    expect(niceTicks(0, 0.7, 3)).toEqual([0, 0.2, 0.4, 0.6, 0.8])
    expect(niceTicks(5, 5, 4)).toEqual([5, 6])
  })

  it('maps values and categories to positions', () => {
    const y = linearScale([0, 100], [200, 0])
    expect(y(0)).toBe(200)
    expect(y(50)).toBe(100)
    const x = bandScale(4, [0, 400])
    expect(x.step).toBe(100)
    expect(x.start(0)).toBeGreaterThan(0)
    close(x.start(1) - x.start(0), 100)
    expect(x.bandwidth).toBeLessThan(100)
  })
})

describe('laying out a chart', () => {
  it('puts grouped bars side by side, with negatives below zero', () => {
    const layout = layoutChart(spec({}), WIDE_LAYOUT)
    expect(layout.bars).toHaveLength(4)
    const zero = layout.zeroY
    const [oneA, oneB, twoA, twoB] = layout.bars
    expect(oneA.x).toBeLessThan(oneB.x)
    close(oneA.x + oneA.width, oneB.x)
    expect(oneA.y + oneA.height).toBeCloseTo(zero, 5)
    close(oneB.height, oneA.height * 2)
    expect(twoB.y).toBeCloseTo(zero, 5)
    expect(twoB.height).toBeGreaterThan(0)
    expect(twoA.height).toBeGreaterThan(oneB.height)
    expect(layout.ticks.map(tick => tick.value)).toContain(0)
  })

  it('stacks bars, positives up and negatives down', () => {
    const layout = layoutChart(spec({ stacked: true }), WIDE_LAYOUT)
    const [oneA, oneB, twoA, twoB] = layout.bars
    close(oneA.x, oneB.x)
    close(oneA.width, oneB.width)
    close(oneB.y + oneB.height, oneA.y)
    close(twoA.y + twoA.height, layout.zeroY)
    close(twoB.y, layout.zeroY)
    expect(Math.min(...layout.ticks.map(tick => tick.value))).toBeLessThanOrEqual(-10)
    expect(Math.max(...layout.ticks.map(tick => tick.value))).toBeGreaterThanOrEqual(30)
  })

  it('breaks a line at missing values', () => {
    const layout = layoutChart(spec({
      type: 'line',
      data: [
        { k: '1', a: 1, b: 2 },
        { k: '2', a: null, b: 3 },
        { k: '3', a: 2, b: 4 },
        { k: '4', a: 3, b: 1 },
      ],
    }), WIDE_LAYOUT)
    const a = layout.lines.find(line => line.key === 'a')!
    expect(a.path.match(/M/g)).toHaveLength(2)
    expect(layout.lines.find(line => line.key === 'b')!.path.match(/M/g)).toHaveLength(1)
  })

  it('stacks areas on each other', () => {
    const layout = layoutChart(spec({
      type: 'area',
      stacked: true,
      data: [
        { k: '1', a: 10, b: 5 },
        { k: '2', a: 20, b: 5 },
      ],
    }), WIDE_LAYOUT)
    expect(layout.areas).toHaveLength(2)
    expect(Math.max(...layout.ticks.map(tick => tick.value))).toBeGreaterThanOrEqual(25)
    const top = (path: string) => Math.min(...[
      ...path.matchAll(/[ML]([\d.]+),([\d.]+)/g),
    ].map(match => Number(match[2])))
    expect(top(layout.areas[1].path)).toBeLessThan(top(layout.areas[0].path))
  })

  it('slices a pie in proportion, starting at the top', () => {
    const layout = layoutChart(spec({
      type: 'pie',
      series: [
        { key: 'a' },
      ],
      data: [
        { k: 'x', a: 1 },
        { k: 'y', a: 3 },
      ],
    }), WIDE_LAYOUT)
    expect(layout.slices.map(slice => slice.percent)).toEqual([25, 75])
    close(layout.slices[0].start, 0)
    close(layout.slices[0].end, Math.PI / 2)
    close(layout.slices[1].end, Math.PI * 2)
    expect(layout.slices[0].path).toMatch(/^M/)
    const donut = layoutChart(spec({
      type: 'pie',
      donut: true,
      series: [
        { key: 'a' },
      ],
      data: [
        { k: 'x', a: 1 },
        { k: 'y', a: 3 },
      ],
    }), WIDE_LAYOUT)
    expect(donut.slices[0].path.match(/A/g)).toHaveLength(2)
  })

  it('draws one full slice for a single row, and nothing for an empty pie', () => {
    expect(layoutChart(spec({
      type: 'pie',
      series: [
        { key: 'a' },
      ],
      data: [
        { k: 'x', a: 5 },
      ],
    }), WIDE_LAYOUT).slices).toHaveLength(1)
    expect(layoutChart(spec({
      type: 'pie',
      series: [
        { key: 'a' },
      ],
      data: [
        { k: 'x', a: 0 },
      ],
    }), WIDE_LAYOUT).slices).toHaveLength(0)
  })

  it('stretches the axis to the given range and reference lines', () => {
    const layout = layoutChart(spec({
      y: { min: -50, max: 200 },
      refs: [
        { y: 150, label: 'Quota' },
      ],
    }), WIDE_LAYOUT)
    const values = layout.ticks.map(tick => tick.value)
    expect(Math.min(...values)).toBeLessThanOrEqual(-50)
    expect(Math.max(...values)).toBeGreaterThanOrEqual(200)
    expect(layout.refs).toEqual([
      expect.objectContaining({ label: 'Quota' }),
    ])
    const ref = layout.refs[0].y
    expect(ref).toBeGreaterThan(0)
    expect(ref).toBeLessThan(layout.zeroY)
  })

  it('formats tick labels, with the unit on the axis', () => {
    const layout = layoutChart(spec({
      data: [
        { k: 'one', a: 1200, b: 3400 },
      ],
      format: { unit: 'ms' },
    }), WIDE_LAYOUT)
    expect(layout.ticks.map(tick => tick.label)).toContain('2k')
  })

  it('grays out what is not highlighted, and uses the colors asked for', () => {
    const layout = layoutChart(spec({
      highlight: 'b',
      series: [
        { key: 'a', color: 5 },
        { key: 'b' },
      ],
    }), WIDE_LAYOUT)
    expect(layout.bars.filter(bar => bar.key === 'a').every(bar => bar.muted && bar.color === 5)).toBe(true)
    expect(layout.bars.filter(bar => bar.key === 'b').every(bar => !bar.muted && bar.color === 2)).toBe(true)
    const pie = layoutChart(spec({
      type: 'pie',
      series: [
        { key: 'a' },
      ],
      highlight: 'y',
      data: [
        { k: 'x', a: 1 },
        { k: 'y', a: 3 },
      ],
    }), WIDE_LAYOUT)
    expect(pie.slices.map(slice => slice.muted)).toEqual([true, false])
  })

  it('shows fewer labels when compact', () => {
    const data = Array.from({ length: 12 }, (_, i) => ({ k: `category ${i}`, a: i, b: i }))
    const wide = layoutChart(spec({ data }), WIDE_LAYOUT)
    const compact = layoutChart(spec({ data }), COMPACT_LAYOUT)
    expect(compact.categories.filter(label => label.shown).length).toBeLessThan(wide.categories.filter(label => label.shown).length)
    expect(compact.ticks.length).toBeLessThanOrEqual(wide.ticks.length)
  })
})

describe('rendering the SVG (SSR)', () => {
  const ssr = (chart: Partial<ChartSpec>) => renderToString(createSSRApp({
    render: () => h(RichRenderer, {
      value: {
        root: {
          type: 'root',
          children: [
            {
              type: 'chart',
              spec: JSON.stringify(spec(chart)),
            },
          ],
        },
      } as never,
    }),
  }))

  it.each(['bar', 'line', 'area', 'pie'] as const)('outputs a wide and a compact %s chart', async (type) => {
    const html = await ssr(type === 'pie'
      ? {
          type,
          series: [
            { key: 'a' },
          ],
          data: [
            { k: 'x', a: 1 },
            { k: 'y', a: 2 },
          ],
          title: 'T',
        }
      : { type, title: 'T' })
    expect(html.match(/<svg[^>]*class="hlx-chart-svg"/g)).toHaveLength(2)
    expect(html).toContain('data-size="wide"')
    expect(html).toContain('data-size="compact"')
    expect(html).toMatch(/<svg[^>]*role="img"[^>]*aria-label="T"/)
  })

  it('names colors by class, so the color scheme decides them', async () => {
    const html = await ssr({ highlight: 'b' })
    expect(html).toContain('hlx-chart-c1')
    expect(html).toContain('hlx-chart-c2')
    expect(html).toContain('data-muted')
  })

  it('lists the series in a legend', async () => {
    const html = await ssr({})
    expect(html).toMatch(/hlx-chart-legend[^A]*A[\s\S]*B/)
  })
})
