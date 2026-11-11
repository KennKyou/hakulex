import { describe, expect, it } from 'vitest'
import {
  addRow,
  addSeries,
  choosePieSeries,
  dataFields,
  parseCellNumber,
  parseChartDraft,
  pasteTable,
  patchDraft,
  patchNested,
  removeRow,
  removeSeries,
  renameField,
  serializeChartDraft,
  setCategoryLabel,
  setCell,
  setSeriesLabel,
} from '../src/chart/draft'

function draft() {
  return {
    version: 1,
    type: 'bar',
    x: 'month',
    highlight: 'a',
    refs: [
      { y: 5, label: 'Goal' },
    ],
    series: [
      { key: 'a', label: 'A' },
      { key: 'b' },
    ],
    data: [
      { month: 'Jan', a: 1, b: 2, note: 'x' },
      { month: 'Feb', a: 3, b: null },
    ],
  }
}

describe('reading and writing a draft', () => {
  it('reads a JSON object, and nothing else', () => {
    expect(parseChartDraft(JSON.stringify(draft()))).toEqual(draft())
    for (const source of ['{ nope', '[]', '42', 'null', '"text"'])
      expect(parseChartDraft(source)).toBeNull()
  })

  it('writes indented JSON, keeping fields the form does not manage', () => {
    const text = serializeChartDraft(draft())
    expect(text).toBe(JSON.stringify(draft(), null, 2))
    expect(JSON.parse(text).refs).toEqual([
      { y: 5, label: 'Goal' },
    ])
  })

  it('sets fields, and removes those left blank', () => {
    expect(patchDraft(draft(), { title: 'T', type: 'line' })).toMatchObject({ title: 'T', type: 'line', refs: draft().refs })
    const cleared = patchDraft({
      ...draft(),
      title: 'T',
      note: 'N',
    }, { title: '', note: undefined })
    expect(cleared).not.toHaveProperty('title')
    expect(cleared).not.toHaveProperty('note')
  })

  it('sets nested fields, and drops an object left empty', () => {
    expect(patchNested(draft(), 'format', { unit: 'ms' })).toMatchObject({
      format: { unit: 'ms' },
    })
    expect(patchNested({
      ...draft(),
      format: { unit: 'ms', decimals: 1 },
    }, 'format', { unit: undefined })).toMatchObject({
      format: { decimals: 1 },
    })
    expect(patchNested({
      ...draft(),
      y: { min: 0 },
    }, 'y', { min: undefined })).not.toHaveProperty('y')
  })

  it('lists the fields the data has, in order of appearance', () => {
    expect(dataFields(draft())).toEqual(['month', 'a', 'b', 'note'])
    expect(dataFields({ data: 'nope' })).toEqual([])
  })
})

describe('renaming a field', () => {
  it('renames it in every row, the series, the category and the highlight', () => {
    const renamed = renameField(draft(), 'a', 'apples')!
    expect(renamed.series).toEqual([
      { key: 'apples', label: 'A' },
      { key: 'b' },
    ])
    expect(renamed.highlight).toBe('apples')
    expect((renamed.data as Record<string, unknown>[])[0]).toEqual({
      month: 'Jan',
      apples: 1,
      b: 2,
      note: 'x',
    })
    expect(Object.keys((renamed.data as Record<string, unknown>[])[0])).toEqual(['month', 'apples', 'b', 'note'])
    expect(renameField(draft(), 'month', 'when')).toMatchObject({
      x: 'when',
      data: [
        { when: 'Jan' },
        { when: 'Feb' },
      ],
    })
  })

  it('refuses a blank name or one already used', () => {
    expect(renameField(draft(), 'a', '  ')).toBeNull()
    expect(renameField(draft(), 'a', 'b')).toBeNull()
    expect(renameField(draft(), 'a', 'note')).toBeNull()
    expect(renameField(draft(), 'a', 'a')).toEqual(draft())
  })
})

describe('series and rows', () => {
  it('adds a series with a fresh key and empty values, up to six', () => {
    const added = addSeries(draft())!
    expect((added.series as unknown[]).length).toBe(3)
    const key = (added.series as { key: string }[])[2].key
    expect(['a', 'b', 'month', 'note']).not.toContain(key)
    expect((added.data as Record<string, unknown>[]).every(row => row[key] === null)).toBe(true)
    let full: Record<string, unknown> | null = draft()
    for (let i = 0; i < 4; i++)
      full = addSeries(full!)
    expect((full!.series as unknown[]).length).toBe(6)
    expect(addSeries(full!)).toBeNull()
  })

  it('removes a series with its column and highlight, but not the last one', () => {
    const removed = removeSeries(draft(), 'a')!
    expect(removed.series).toEqual([
      { key: 'b' },
    ])
    expect(removed).not.toHaveProperty('highlight')
    expect((removed.data as Record<string, unknown>[])[0]).toEqual({ month: 'Jan', b: 2, note: 'x' })
    expect(removeSeries(removed, 'b')).toBeNull()
  })

  it('adds a row at the end and removes rows', () => {
    const added = addRow(draft())
    expect((added.data as unknown[]).at(-1)).toEqual({ month: '', a: null, b: null })
    expect((removeRow(draft(), 0).data as unknown[])).toEqual([
      { month: 'Feb', a: 3, b: null },
    ])
  })
})

describe('cells', () => {
  it.each([
    ['1,200', 1200],
    [' 3.5 ', 3.5],
    ['-2', -2],
    ['', null],
    ['  ', null],
    ['abc', undefined],
    ['12ms', undefined],
    ['Infinity', undefined],
  ])('reads %j as %j', (raw, value) => {
    expect(parseCellNumber(raw)).toBe(value)
  })

  it('stores categories as text and values as numbers, refusing what is not one', () => {
    expect((setCell(draft(), 0, 'month', '1,200')!.data as Record<string, unknown>[])[0].month).toBe('1,200')
    expect((setCell(draft(), 0, 'a', '1,200')!.data as Record<string, unknown>[])[0].a).toBe(1200)
    expect((setCell(draft(), 1, 'b', '')!.data as Record<string, unknown>[])[1].b).toBeNull()
    expect(setCell(draft(), 0, 'a', 'abc')).toBeUndefined()
  })
})

describe('pasting from a spreadsheet', () => {
  it('replaces the data, with the first column as categories and the rest as series', () => {
    const pasted = pasteTable(draft(), 'Month\tSales\tCost\nJan\t1,200\t300\nFeb\t"1,500"\t\r\n')!
    expect(pasted.draft).toMatchObject({
      x: 'Month',
      series: [
        { key: 'Sales', label: 'Sales' },
        { key: 'Cost', label: 'Cost' },
      ],
      data: [
        { Month: 'Jan', Sales: 1200, Cost: 300 },
        { Month: 'Feb', Sales: 1500, Cost: null },
      ],
      refs: draft().refs,
    })
    expect(pasted.draft).not.toHaveProperty('highlight')
    expect(pasted.issues).toEqual([])
    expect(pasted.dropped).toBe(0)
  })

  it('stores text where a number belongs as empty, and says where', () => {
    const pasted = pasteTable(draft(), 'k\tv\na\tn/a\nb\t2')!
    expect(pasted.draft.data).toEqual([
      { k: 'a', v: null },
      { k: 'b', v: 2 },
    ])
    expect(pasted.issues).toEqual([
      { row: 0, column: 'v', value: 'n/a' },
    ])
  })

  it('keeps six series, and gives blank or repeated headers names of their own', () => {
    const header = [
      'k',
      'a',
      '',
      'a',
      'd',
      'e',
      'f',
      'g',
      'h',
    ].join('\t')
    const pasted = pasteTable(draft(), `${header}\nx\t1\t2\t3\t4\t5\t6\t7\t8`)!
    const keys = (pasted.draft.series as { key: string }[]).map(series => series.key)
    expect(keys).toHaveLength(6)
    expect(new Set(keys).size).toBe(6)
    expect(pasted.dropped).toBe(2)
  })

  it('leaves a single value to ordinary typing', () => {
    expect(pasteTable(draft(), '42')).toBeNull()
    expect(pasteTable(draft(), '42\n')).toBeNull()
  })
})

describe('names the form shows', () => {
  it('names a series without touching its key', () => {
    const named = setSeriesLabel(draft(), 'b', ' Bees ')
    expect(named.series).toEqual([
      { key: 'a', label: 'A' },
      { key: 'b', label: 'Bees' },
    ])
    expect(named.data).toEqual(draft().data)
    expect(setSeriesLabel(draft(), 'a', '  ').series).toEqual([
      { key: 'a' },
      { key: 'b' },
    ])
  })

  it('names the category column through the axis label, keeping the field', () => {
    const named = setCategoryLabel(draft(), ' Month ')
    expect(named).toMatchObject({ x: 'month', xLabel: 'Month' })
    expect(named.data).toEqual(draft().data)
    expect(setCategoryLabel({
      ...draft(),
      xLabel: 'old',
    }, '')).not.toHaveProperty('xLabel')
  })
})

describe('choosing what a pie shows', () => {
  it('moves the chosen series first, keeping the others and their data', () => {
    const chosen = choosePieSeries(draft(), 'b')
    expect(chosen.series).toEqual([
      { key: 'b' },
      { key: 'a', label: 'A' },
    ])
    expect(chosen.data).toEqual(draft().data)
    expect(choosePieSeries(draft(), 'a')).toEqual(draft())
    expect(choosePieSeries(draft(), 'missing')).toEqual(draft())
  })
})
