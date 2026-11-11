import type { ChartIssue } from '../src'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { chartTable, formatChartValue, parseChartSource, RichRenderer, validateChartSpec } from '../src'

const bar = {
  version: 1,
  type: 'bar',
  title: 'Commits',
  x: 'component',
  series: [
    { key: 'before', label: 'Before' },
    { key: 'after', label: 'After' },
  ],
  data: [
    { component: 'Editor', before: 48, after: 12 },
    { component: 'Toolbar', before: 36, after: null },
  ],
}

function issues(input: unknown): ChartIssue[] {
  const result = validateChartSpec(input)
  if (result.ok)
    throw new Error('expected problems')
  return result.issues
}
const paths = (input: unknown) => issues(input).map(issue => issue.path)

function ssr(...children: unknown[]) {
  return renderToString(createSSRApp({
    render: () => h(RichRenderer, {
      value: {
        root: { type: 'root', children },
      } as never,
    }),
  }))
}
function chart(spec: unknown, extra: Record<string, unknown> = {}) {
  return {
    type: 'chart',
    version: 1,
    spec,
    ...extra,
  }
}

describe('validating a chart spec', () => {
  it('accepts a valid spec, setting version to 1', () => {
    const result = validateChartSpec({ ...bar, version: undefined })
    expect(result).toMatchObject({
      ok: true,
      spec: { version: 1, type: 'bar' },
    })
  })

  it('reads a JSON string or an object', () => {
    expect(parseChartSource(JSON.stringify(bar)).ok).toBe(true)
    expect(parseChartSource(bar).ok).toBe(true)
  })

  it('says why text is not JSON', () => {
    const result = parseChartSource('{ "type": ')
    expect(result.ok).toBe(false)
    expect(!result.ok && result.issues[0]).toMatchObject({ path: '(root)' })
    expect(!result.ok && result.issues[0].message).toContain('JSON')
  })

  it.each([
    [42],
    [null],
    [[]],
    ['"text"'],
  ])('refuses %j as a spec', (input) => {
    expect(parseChartSource(input).ok).toBe(false)
  })

  it('lists every missing part at once', () => {
    expect(paths({ type: 'radar' })).toEqual(expect.arrayContaining(['type', 'x', 'series', 'data']))
  })

  it('suggests the supported types', () => {
    expect(issues({ ...bar, type: 'radar' })[0]).toMatchObject({ path: 'type' })
    expect(issues({ ...bar, type: 'radar' })[0].hint).toContain('bar')
  })

  it('allows at most six series; a pie may have more rows', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ key: `s${i}` }))
    const row = Object.fromEntries([
      ['component', 'a'],
      ...many.map(({ key }) => [key, 1]),
    ])
    expect(paths({
      ...bar,
      series: many,
      data: [row],
    })).toContain('series')
    const slices = Array.from({ length: 7 }, (_, i) => ({ component: `c${i}`, before: 1 }))
    expect(validateChartSpec({
      ...bar,
      type: 'pie',
      series: [
        { key: 'before' },
      ],
      data: slices,
    }).ok).toBe(true)
  })

  it('names fields the data does not have, with the ones it does', () => {
    const found = issues({
      ...bar,
      x: 'name',
      series: [
        { key: 'before' },
        { key: 'later' },
      ],
    })
    expect(found.map(issue => issue.path)).toEqual(['x', 'series[1].key'])
    expect(found[0].hint).toContain('"component"')
  })

  it('wants bare numbers, and says where the unit goes', () => {
    const found = issues({
      ...bar,
      data: [
        { component: 'a', before: '12ms', after: true },
      ],
    })
    expect(found.map(issue => issue.path)).toEqual(['data[0].before', 'data[0].after'])
    expect(found[0].hint).toContain('format.unit')
    expect(found[1].hint).toBeUndefined()
  })

  it('refuses negative pie slices and rows that are not objects', () => {
    expect(paths({
      ...bar,
      type: 'pie',
      series: [
        { key: 'before' },
      ],
      data: [
        { component: 'a', before: -1 },
      ],
    })).toEqual(['data[0].before'])
    expect(paths({
      ...bar,
      data: [
        1,
        { component: 'a', before: 1, after: 1 },
      ],
    })).toEqual(['data[0]'])
    expect(paths({
      ...bar,
      data: [
        { component: 'a', before: Number.POSITIVE_INFINITY, after: 1 },
      ],
    })).toEqual(['data[0].before'])
  })

  it('wants the highlight to be a series, except in a pie', () => {
    expect(paths({ ...bar, highlight: 'later' })).toEqual(['highlight'])
    expect(paths({ ...bar, highlight: 3 })).toEqual(['highlight'])
    expect(validateChartSpec({
      ...bar,
      type: 'pie',
      series: [
        { key: 'before' },
      ],
      highlight: 'Editor',
    }).ok).toBe(true)
  })

  it('refuses a series that is not { key }', () => {
    expect(paths({
      ...bar,
      series: [
        { label: 'x' },
        { key: 'after' },
      ],
    })).toEqual(['series[0]'])
  })
})

describe('formatting chart values', () => {
  it.each([
    [1234, {}, '1.2k'],
    [12345, {}, '12k'],
    [3_400_000, {}, '3.4M'],
    [2_000_000_000, {}, '2B'],
    [
      1234,
      { compact: false },
      '1234',
    ],
    [1.23456, {}, '1.23'],
    [
      1.5,
      { decimals: 2 },
      '1.50',
    ],
    [-12, {}, '−12'],
    [
      12,
      { signed: true },
      '+12',
    ],
    [
      0,
      { signed: true },
      '0',
    ],
    [
      12,
      { unit: '$' },
      '$12',
    ],
    [
      -12,
      { unit: '$' },
      '−$12',
    ],
    [
      12,
      { unit: '%' },
      '12%',
    ],
    [
      12,
      { unit: 'ms' },
      '12 ms',
    ],
    [null, {}, '—'],
  ] as const)('shows %j with %j as %s', (value, format, shown) => {
    expect(formatChartValue(value, format)).toBe(shown)
  })
})

describe('the chart as a table', () => {
  it('has the categories, then a column per series', () => {
    expect(chartTable({ ...bar, xLabel: 'Part' } as never)).toEqual({
      columns: ['Part', 'Before', 'After'],
      rows: [
        ['Editor', 48, 12],
        ['Toolbar', 36, null],
      ],
    })
  })

  it('uses the keys when there are no labels', () => {
    expect(chartTable({
      ...bar,
      series: [
        { key: 'before' },
      ],
    } as never).columns).toEqual(['component', 'before'])
  })
})

describe('rendering a chart (SSR)', () => {
  it('shows the titles, notes and a table for screen readers', async () => {
    const html = await ssr(chart(JSON.stringify({
      ...bar,
      subtitle: 'Sub',
      source: 'Src',
      note: 'Note',
      format: { unit: 'ms' },
    })))
    expect(html).toContain('class="hlx-chart"')
    for (const text of ['Commits', 'Sub', 'Src', 'Note'])
      expect(html).toContain(text)
    const table = /<table class="hlx-chart-table[^"]*"[\s\S]*?<\/table>/.exec(html)![0]
    expect(table).toContain('Before')
    expect(table).toContain('48 ms')
    expect(table).toContain('—')
  })

  it('shows every problem with its place', async () => {
    const html = await ssr(chart(JSON.stringify({
      ...bar,
      data: [
        { component: 'a', before: '12ms', after: 1 },
      ],
      highlight: 'x',
    })))
    expect(html).toContain('class="hlx-chart-error"')
    expect(html).toContain('data[0].before')
    expect(html).toContain('highlight')
    expect(html).toContain('format.unit')
  })

  it.each([
    ['not JSON', '{ nope'],
    ['not a string', 42],
    ['missing', undefined],
  ])('shows an error card when the spec is %s', async (_name, spec) => {
    const html = await ssr(chart(spec))
    expect(html).toContain('hlx-chart-error')
  })

  it('shows text as text', async () => {
    const html = await ssr(chart(JSON.stringify({
      ...bar,
      title: '<b>x</b>',
      data: [
        { component: '<img src=x onerror=alert(1)>', before: 1, after: 2 },
      ],
    })))
    expect(html).not.toContain('<b>x')
    expect(html).not.toContain('<img')
    const bad = await ssr(chart('{ "<b>": '))
    expect(bad).not.toContain('<b>')
  })

  it('keeps a paragraph holding a chart out of a p', async () => {
    const html = await ssr({
      type: 'paragraph',
      children: [
        chart(JSON.stringify(bar)),
      ],
    })
    expect(html).toMatch(/^<div class="hlx-root[^>]*><div class="hlx-paragraph/)
  })
})
