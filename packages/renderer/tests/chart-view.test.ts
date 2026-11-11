import type { ChartSpec } from '../src'
import { renderToString } from '@vue/server-renderer'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { ChartView, RichRenderer } from '../src'

afterEach(() => {
  document.body.innerHTML = ''
})

function spec(extra: Partial<ChartSpec> = {}): ChartSpec {
  return {
    version: 1,
    type: 'bar',
    title: '造訪',
    x: 'k',
    format: { unit: 'ms' },
    series: [
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' },
    ],
    data: [
      { k: 'one', a: 1234, b: null },
      { k: 'two', a: 30, b: 40 },
    ],
    ...extra,
  }
}

const toggle = (wrapper: ReturnType<typeof mount>) => wrapper.find('button.hlx-chart-toggle')
const visibleTable = (wrapper: ReturnType<typeof mount>) => wrapper.find('table.hlx-chart-table:not(.hlx-visually-hidden)')

describe('viewing the data', () => {
  it('starts on the chart, with a button to show the data', () => {
    const wrapper = mount(ChartView, {
      props: {
        spec: JSON.stringify(spec()),
      },
    })
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(toggle(wrapper).text()).toBe('檢視資料')
    expect(toggle(wrapper).attributes('aria-pressed')).toBe('false')
    expect(visibleTable(wrapper).exists()).toBe(false)
  })

  it('shows the same table readers of the hidden one get, and goes back', async () => {
    const wrapper = mount(ChartView, {
      props: {
        spec: JSON.stringify(spec()),
      },
    })
    const hidden = wrapper.find('table.hlx-chart-table').html().replace(' hlx-visually-hidden', '')
    await toggle(wrapper).trigger('click')
    expect(wrapper.find('.hlx-chart-plot').exists()).toBe(false)
    expect(wrapper.find('.hlx-chart-legend').exists()).toBe(false)
    expect(visibleTable(wrapper).html()).toBe(hidden)
    expect(visibleTable(wrapper).text()).toContain('1.2k ms')
    expect(toggle(wrapper).text()).toBe('檢視圖表')
    expect(toggle(wrapper).attributes('aria-pressed')).toBe('true')
    await toggle(wrapper).trigger('click')
    expect(wrapper.find('.hlx-chart-plot').exists()).toBe(true)
    expect(visibleTable(wrapper).exists()).toBe(false)
  })

  it('can be switched from outside, without its own button', async () => {
    const wrapper = mount(ChartView, {
      props: {
        spec: JSON.stringify(spec()),
        toggle: false,
        view: 'table',
      },
    })
    expect(toggle(wrapper).exists()).toBe(false)
    expect(visibleTable(wrapper).exists()).toBe(true)
    await wrapper.setProps({ view: 'chart' })
    expect(wrapper.find('.hlx-chart-plot').exists()).toBe(true)
  })

  it('tells the owner when its button switches', async () => {
    const wrapper = mount(ChartView, {
      props: {
        'spec': JSON.stringify(spec()),
        'view': 'chart',
        'onUpdate:view': (view: string) => wrapper.setProps({ view }),
      },
    })
    await toggle(wrapper).trigger('click')
    expect(wrapper.emitted('update:view')).toEqual([
      ['table'],
    ])
    expect(visibleTable(wrapper).exists()).toBe(true)
  })

  it('has no button on an error card', () => {
    const wrapper = mount(ChartView, {
      props: { spec: '{' },
    })
    expect(toggle(wrapper).exists()).toBe(false)
  })
})

describe('a chart with no data', () => {
  it('says so under its title, with no drawing, legend or button', () => {
    const wrapper = mount(ChartView, {
      props: {
        spec: JSON.stringify(spec({ data: [] })),
      },
    })
    expect(wrapper.find('.hlx-chart-error').exists()).toBe(false)
    expect(wrapper.find('.hlx-chart-title').text()).toBe('造訪')
    expect(wrapper.find('.hlx-chart-empty').text()).toBe('還沒有資料')
    expect(wrapper.find('svg').exists()).toBe(false)
    expect(wrapper.find('.hlx-chart-legend').exists()).toBe(false)
    expect(toggle(wrapper).exists()).toBe(false)
  })
})

describe('server rendering', () => {
  it.each([
    [
      'a chart',
      spec(),
    ],
    [
      'no data',
      spec({ data: [] }),
    ],
  ])('puts out %s first, and hydrates without warnings', async (_, value) => {
    const app = () => createSSRApp({
      render: () => h(RichRenderer, {
        value: {
          root: {
            type: 'root',
            children: [
              {
                type: 'chart',
                spec: JSON.stringify(value),
              },
            ],
          },
        } as never,
      }),
    })
    const html = await renderToString(app())
    if (value.data.length) {
      expect(html).toContain('<svg')
      expect(html).toContain('檢視資料')
    }
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
