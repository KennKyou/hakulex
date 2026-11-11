import type { ChartSpec } from '../src'
import { renderToString } from '@vue/server-renderer'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { RichRenderer } from '../src'
import { chartHover, nearestCategory, sliceAt } from '../src/chart/hover'
import { layoutChart, WIDE_LAYOUT } from '../src/chart/svg'

afterEach(() => {
  document.body.innerHTML = ''
})

function spec(extra: Partial<ChartSpec> = {}): ChartSpec {
  return {
    version: 1,
    type: 'bar',
    x: 'k',
    series: [
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' },
    ],
    data: [
      { k: 'one', a: 10, b: null },
      { k: 'two', a: 30, b: 40 },
      { k: 'three', a: 1200, b: 5 },
    ],
    ...extra,
  }
}
function pie(extra: Partial<ChartSpec> = {}) {
  return spec({
    type: 'pie',
    series: [
      { key: 'a' },
    ],
    data: [
      { k: 'x', a: 1 },
      { k: 'y', a: 3 },
    ],
    ...extra,
  })
}

describe('what a hover shows', () => {
  it('finds the category under a point, and none outside the plot', () => {
    const layout = layoutChart(spec(), WIDE_LAYOUT)
    expect(nearestCategory(layout, layout.categories[1].x + 3)).toBe(1)
    expect(nearestCategory(layout, layout.categories[2].x)).toBe(2)
    expect(nearestCategory(layout, layout.plot.left - 5)).toBeNull()
    expect(nearestCategory(layout, layout.plot.right + 5)).toBeNull()
  })

  it('lists a bar category in series order, with a dash for missing values', () => {
    const layout = layoutChart(spec({
      format: { unit: 'ms' },
    }), WIDE_LAYOUT)
    expect(chartHover(spec({
      format: { unit: 'ms' },
    }), layout, 0)).toMatchObject({
      index: 0,
      title: 'one',
      rows: [
        { label: 'A', value: '10 ms', color: 1 },
        { label: 'B', value: '—', color: 2 },
      ],
    })
    expect(chartHover(spec(), layout, 0)!.total).toBeUndefined()
  })

  it('adds a total when stacked', () => {
    const stacked = spec({ stacked: true })
    expect(chartHover(stacked, layoutChart(stacked, WIDE_LAYOUT), 2)!.total).toBe('1.2k')
  })

  it('sorts lines by value, largest first, missing last', () => {
    const line = spec({
      type: 'line',
      series: [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
        { key: 'c', label: 'C' },
      ],
      data: [
        { k: 'one', a: 1, b: null, c: 5 },
      ],
    })
    expect(chartHover(line, layoutChart(line, WIDE_LAYOUT), 0)!.rows.map(row => row.label)).toEqual(['C', 'A', 'B'])
  })

  it('marks the muted series', () => {
    const highlighted = spec({ highlight: 'b' })
    expect(chartHover(highlighted, layoutChart(highlighted, WIDE_LAYOUT), 1)!.rows.map(row => row.muted)).toEqual([true, false])
  })

  it('puts the tip on the side with room', () => {
    const layout = layoutChart(spec(), WIDE_LAYOUT)
    expect(chartHover(spec(), layout, 0)!.side).toBe('right')
    expect(chartHover(spec(), layout, 2)!.side).toBe('left')
    expect(chartHover(spec(), layout, 1)!.x).toBeCloseTo(layout.categories[1].x)
  })

  it('finds the slice at a point, and none off the pie or in a donut\'s hole', () => {
    const layout = layoutChart(pie({ donut: true }), WIDE_LAYOUT)
    const { cx, cy, r } = layout.pie!
    // The first slice is the top-right quarter, the second the rest.
    expect(sliceAt(layout, cx + r * 0.6, cy - r * 0.6)).toBe(0)
    expect(sliceAt(layout, cx - r * 0.8, cy)).toBe(1)
    expect(sliceAt(layout, cx, cy)).toBeNull()
    expect(sliceAt(layout, cx + r + 5, cy)).toBeNull()
  })

  it('describes a pie slice with its share', () => {
    const chart = pie()
    expect(chartHover(chart, layoutChart(chart, WIDE_LAYOUT), 1)).toMatchObject({
      title: 'y',
      rows: [
        { label: 'y', value: '3', percent: 75 },
      ],
    })
  })
})

function mountChart(chart: ChartSpec) {
  return mount(RichRenderer, {
    props: {
      value: {
        root: {
          type: 'root',
          children: [
            {
              type: 'chart',
              spec: JSON.stringify(chart),
            },
          ],
        },
      },
    } as never,
    attachTo: document.body,
  })
}
/** The page has no layout here: give the wide drawing its full size, starting at 0. */
function sizeWide(wrapper: ReturnType<typeof mount>) {
  const svg = wrapper.find('svg[data-size="wide"]').element as SVGSVGElement
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: WIDE_LAYOUT.width,
    height: WIDE_LAYOUT.height,
    right: WIDE_LAYOUT.width,
    bottom: WIDE_LAYOUT.height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)
  const compact = wrapper.find('svg[data-size="compact"]').element as SVGSVGElement
  vi.spyOn(compact, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    right: 0,
    bottom: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)
}
const tip = (wrapper: ReturnType<typeof mount>) => wrapper.find('.hlx-chart-tooltip')

describe('hovering in the page', () => {
  it('shows the category under the pointer, and hides when it leaves', async () => {
    const wrapper = mountChart(spec())
    await flushPromises()
    sizeWide(wrapper)
    const layout = layoutChart(spec(), WIDE_LAYOUT)
    const plot = wrapper.find('.hlx-chart-plot')
    await plot.trigger('pointermove', { clientX: layout.categories[1].x, clientY: 50, pointerType: 'mouse' })
    expect(tip(wrapper).text()).toContain('two')
    expect(tip(wrapper).text()).toContain('40')
    expect(wrapper.find('.hlx-chart-hover-band').exists()).toBe(true)
    await plot.trigger('pointerleave')
    expect(tip(wrapper).exists()).toBe(false)
  })

  it('draws a guide and points on a line chart', async () => {
    const line = spec({ type: 'line' })
    const wrapper = mountChart(line)
    await flushPromises()
    sizeWide(wrapper)
    await wrapper.find('.hlx-chart-plot').trigger('pointermove', { clientX: layoutChart(line, WIDE_LAYOUT).categories[2].x, clientY: 50 })
    expect(wrapper.find('.hlx-chart-hover-guide').exists()).toBe(true)
    expect(wrapper.findAll('.hlx-chart-hover-point').length).toBeGreaterThan(0)
  })

  it('steps through categories with the keyboard, and says what it shows', async () => {
    const wrapper = mountChart(spec())
    await flushPromises()
    const plot = wrapper.find('.hlx-chart-plot')
    expect(plot.attributes('tabindex')).toBe('0')
    await plot.trigger('keydown', { key: 'ArrowRight' })
    expect(tip(wrapper).text()).toContain('one')
    await plot.trigger('keydown', { key: 'ArrowRight' })
    expect(tip(wrapper).text()).toContain('two')
    await plot.trigger('keydown', { key: 'ArrowLeft' })
    expect(tip(wrapper).text()).toContain('one')
    expect(wrapper.find('[aria-live="polite"]').text()).toContain('one')
    await plot.trigger('keydown', { key: 'Escape' })
    expect(tip(wrapper).exists()).toBe(false)
  })

  it('shows on a tap, and hides on a tap elsewhere', async () => {
    const wrapper = mountChart(spec())
    await flushPromises()
    sizeWide(wrapper)
    const layout = layoutChart(spec(), WIDE_LAYOUT)
    await wrapper.find('.hlx-chart-plot').trigger('pointerdown', { clientX: layout.categories[0].x, clientY: 50, pointerType: 'touch' })
    expect(tip(wrapper).text()).toContain('one')
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(tip(wrapper).exists()).toBe(false)
  })

  it('dims the other slices, and shows the slice in a donut\'s middle', async () => {
    const donut = pie({ donut: true })
    const wrapper = mountChart(donut)
    await flushPromises()
    expect(wrapper.find('svg[data-size="wide"] .hlx-chart-center').text()).toContain('4')
    sizeWide(wrapper)
    const at = (chart: ChartSpec, row: number) => {
      const slice = layoutChart(chart, WIDE_LAYOUT).slices.find(item => item.row === row)!
      return { clientX: slice.labelAt[0], clientY: slice.labelAt[1] }
    }
    await wrapper.find('.hlx-chart-plot').trigger('pointermove', at(donut, 1))
    expect(wrapper.find('svg[data-size="wide"] .hlx-chart-center').text()).toContain('75%')
    expect(wrapper.find('svg[data-size="wide"] path[data-index="0"]').attributes('data-dimmed')).toBeDefined()
    expect(tip(wrapper).exists()).toBe(false)
    const plain = mountChart(pie())
    await flushPromises()
    sizeWide(plain)
    await plain.find('.hlx-chart-plot').trigger('pointermove', at(pie(), 0))
    expect(tip(plain).text()).toContain('25%')
  })
})

describe('server rendering', () => {
  it('has no tip, and hydrates without warnings', async () => {
    const app = () => createSSRApp({
      render: () => h(RichRenderer, {
        value: {
          root: {
            type: 'root',
            children: [
              {
                type: 'chart',
                spec: JSON.stringify(spec()),
              },
            ],
          },
        } as never,
      }),
    })
    const html = await renderToString(app())
    expect(html).not.toContain('hlx-chart-tooltip')
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.append(container)
    const warn = vi.spyOn(console, 'warn')
    app().mount(container)
    await flushPromises()
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
