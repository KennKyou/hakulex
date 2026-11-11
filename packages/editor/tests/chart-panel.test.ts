import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { flushPromises, mount } from '@vue/test-utils'
import { $createNodeSelection, $getRoot, $getSelection, $isNodeSelection, $setSelection, KEY_ENTER_COMMAND, UNDO_COMMAND } from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { $isChartNode, RichEditor, serializeEditorState } from '../src'

type Json = Record<string, any>

// Editors left mounted keep reacting after their DOM is gone, and get in the next test's way.
const mounted: { unmount: () => void }[] = []
afterEach(() => {
  mounted.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const element = {
  format: '',
  indent: 0,
  direction: null,
  version: 1,
}
function paragraph() {
  return {
    ...element,
    type: 'paragraph',
    textFormat: 0,
    textStyle: '',
    children: [],
  }
}
function documentWith(...children: unknown[]) {
  return ({
    root: { ...element, type: 'root', children },
  }) as unknown as SerializedEditorState
}
const base = {
  version: 1,
  type: 'bar',
  title: 'Sales',
  x: 'month',
  refs: [
    { y: 5, label: 'Goal' },
  ],
  series: [
    { key: 'a', label: 'A' },
    { key: 'b', label: 'B' },
  ],
  data: [
    { month: 'Jan', a: 1, b: 2 },
    { month: 'Feb', a: 3, b: 4 },
  ],
}

let active: LexicalEditor
async function mountChart(spec: unknown = base, props: Record<string, unknown> = {}) {
  const wrapper = mount(RichEditor, {
    props: {
      modelValue: documentWith({
        type: 'chart',
        version: 1,
        spec: typeof spec === 'string'
          ? spec
          : JSON.stringify(spec),
      }, paragraph()),
      ...props,
    } as never,
    attachTo: document.body,
  })
  mounted.push(wrapper)
  await flushPromises()
  active = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  return active
}
async function selectChart(editor = active) {
  editor.update(() => {
    const selection = $createNodeSelection()
    selection.add($getRoot().getChildren().find($isChartNode)!.getKey())
    $setSelection(selection)
  }, { discrete: true })
  await flushPromises()
}
/** Mounts a chart, picks it and presses Enter, which opens the panel beside it. */
async function openChart(spec: unknown = base) {
  const editor = await mountChart(spec)
  await selectChart(editor)
  editor.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown', { key: 'Enter' }))
  await flushPromises()
  return editor
}

const panel = () => document.querySelector<HTMLElement>('.hlx-chart-panel')!
const raw = () => document.querySelector<HTMLElement>('.hlx-chart-raw')
const toolbar = () => document.querySelector<HTMLElement>('.hlx-chart-toolbar')
const chartIn = () => document.querySelector<HTMLElement>('.hlx-block-editor .hlx-chart')!
function tab(name: string) {
  return [
    ...panel().querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  ].find(item => item.textContent?.trim() === name)!
}
const field = <T extends HTMLElement = HTMLInputElement>(name: string, index = 0) => panel().querySelectorAll<T>(`[data-field="${name}"]`)[index]
const cell = (row: number, key: string) => panel().querySelector<HTMLInputElement>(`[data-field="cell"][data-row="${row}"][data-key="${key}"]`)!
const swatch = (series: number, color: string) => panel().querySelector<HTMLInputElement>(`[data-field="series-color"][data-series="${series}"][value="${color}"]`)!
const swatchButton = (series: number) => panel().querySelector<HTMLButtonElement>(`[data-field="series-swatch"][data-series="${series}"]`)!
/** Picks a chart type from the switch of radio buttons. */
async function chooseType(type: string) {
  await change(panel().querySelector<HTMLInputElement>(`input[type="radio"][data-field="type"][value="${type}"]`)!, true)
}
const typeNow = () => panel().querySelector<HTMLInputElement>('input[type="radio"][data-field="type"]:checked')?.value
function buttonIn(root: HTMLElement, name: string) {
  return [
    ...root.querySelectorAll<HTMLButtonElement>('button'),
  ].find(item => item.textContent?.trim() === name || item.getAttribute('aria-label') === name)!
}
const button = (name: string) => buttonIn(panel(), name)
const tool = (name: string) => buttonIn(toolbar()!, name)
async function open(name: string) {
  tab(name).click()
  await flushPromises()
}
async function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  element.focus()
  element.value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}
async function change(element: HTMLInputElement | HTMLSelectElement, value: string | boolean) {
  if (typeof value === 'boolean')
    (element as HTMLInputElement).checked = value
  else
    element.value = value
  element.dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
}
/**
 * As a browser does when an edited field is left: `change`, then the focus moves away. The
 * focus really moves, rather than a made-up `blur` being sent, which sometimes didn't reach
 * the field's handler.
 */
async function leave(element: HTMLElement) {
  element.dispatchEvent(new Event('change', { bubbles: true }))
  element.blur()
  await flushPromises()
}
const node = (editor = active) => (serializeEditorState(editor.getEditorState()).root.children as unknown as Json[]).find(item => item.type === 'chart')!
/** What the document holds now: every edit is written straight away. */
function stored(editor = active): Json {
  return JSON.parse(node(editor).spec)
}
async function draftNow(): Promise<Json> {
  return stored()
}
async function undo(editor = active) {
  editor.dispatchCommand(UNDO_COMMAND, undefined)
  await flushPromises()
}

describe('the setup tab', () => {
  it('opens on the form, and changes the type, title, category, labels and colors', async () => {
    await openChart({
      ...base,
      data: [
        { month: 'Jan', week: 'w1', a: 1, b: 2 },
      ],
    })
    expect(tab('設定').getAttribute('aria-selected')).toBe('true')
    await chooseType('line')
    await input(field('title'), 'Revenue')
    await change(field<HTMLSelectElement>('x'), 'week')
    await input(field('series-label', 1), 'Bees')
    swatchButton(0).click()
    await flushPromises()
    await change(swatch(0, '4'), true)
    expect(chartIn().querySelector('.hlx-chart-title')!.textContent).toBe('Revenue')
    const spec = stored()
    expect(spec).toMatchObject({
      type: 'line',
      title: 'Revenue',
      x: 'week',
      refs: base.refs,
    })
    expect(spec.series).toEqual([
      { key: 'a', label: 'A', color: 4 },
      { key: 'b', label: 'Bees' },
    ])
  })

  it('shows no keys, and names a series without renaming its field', async () => {
    await openChart({ ...base, highlight: 'a' })
    expect(panel().querySelector('[data-field="series-key"]')).toBeNull()
    await input(field('series-label', 0), 'Apples')
    const spec = await draftNow()
    expect(spec.series[0]).toEqual({ key: 'a', label: 'Apples' })
    expect(spec.highlight).toBe('a')
    expect(spec.data[0]).toEqual({ month: 'Jan', a: 1, b: 2 })
  })

  it('adds and removes series within one to six', async () => {
    await openChart({
      ...base,
      series: [
        { key: 'a' },
      ],
      data: [
        { month: 'Jan', a: 1 },
      ],
    })
    expect(button('刪除系列 1').disabled).toBe(true)
    for (let i = 0; i < 5; i++) {
      button('新增系列').click()
      await flushPromises()
    }
    expect(panel().querySelectorAll('[data-field="series-label"]')).toHaveLength(6)
    expect(button('新增系列').disabled).toBe(true)
    button('刪除系列 2').click()
    await flushPromises()
    const spec = await draftNow()
    expect(spec.series).toHaveLength(5)
    expect(Object.keys(spec.data[0])).toHaveLength(6)
  })
})

describe('the data tab', () => {
  it('edits cells, accepting commas and blanks, and putting back what is not a number', async () => {
    await openChart()
    await open('資料')
    await input(cell(0, 'month'), 'January')
    await input(cell(0, 'a'), '1,200')
    await input(cell(1, 'b'), '')
    await input(cell(1, 'a'), 'abc')
    expect(cell(1, 'a').hasAttribute('data-invalid')).toBe(true)
    await leave(cell(1, 'a'))
    expect(cell(1, 'a').value).toBe('3')
    expect(cell(1, 'a').hasAttribute('data-invalid')).toBe(false)
    const spec = stored()
    expect(spec.data).toEqual([
      { month: 'January', a: 1200, b: 2 },
      { month: 'Feb', a: 3, b: null },
    ])
  })

  it('names columns without renaming their fields, and adds and removes rows', async () => {
    await openChart()
    await open('資料')
    const header = panel().querySelector<HTMLInputElement>('[data-field="header"][data-key="b"]')!
    await input(header, 'bees')
    await leave(header)
    const category = panel().querySelector<HTMLInputElement>('[data-field="header"][data-key="month"]')!
    await input(category, '月份')
    await leave(category)
    button('新增一列').click()
    await flushPromises()
    button('刪除第 1 列').click()
    await flushPromises()
    const spec = await draftNow()
    expect(spec.series[1]).toEqual({ key: 'b', label: 'bees' })
    expect(spec).toMatchObject({ x: 'month', xLabel: '月份' })
    expect(spec.data).toEqual([
      { month: 'Feb', a: 3, b: 4 },
      { month: '', a: null, b: null },
    ])
  })

  it('marks the category column', async () => {
    await openChart()
    await open('資料')
    const headers = [
      ...panel().querySelectorAll('.hlx-chart-data thead th'),
    ]
    expect(headers[0].hasAttribute('data-category')).toBe(true)
    expect(headers[0].textContent).toContain('分類')
    expect(headers[1].hasAttribute('data-category')).toBe(false)
  })

  it('takes a block pasted from a spreadsheet, and says what it left empty', async () => {
    await openChart({
      ...base,
      series: [
        { key: 'a' },
      ],
    })
    await open('資料')
    const table = panel().querySelector<HTMLElement>('.hlx-chart-data')!
    const clipboard = new DataTransfer()
    clipboard.setData('text/plain', 'Month\tSales\tCost\nJan\t1,200\tn/a\nFeb\t900\t300\n')
    table.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }))
    await flushPromises()
    expect(panel().querySelector('[role="status"]')!.textContent).toContain('n/a')
    const spec = await draftNow()
    expect(spec).toMatchObject({
      x: 'Month',
      series: [
        { key: 'Sales' },
        { key: 'Cost' },
      ],
      data: [
        { Month: 'Jan', Sales: 1200, Cost: null },
        { Month: 'Feb', Sales: 900, Cost: 300 },
      ],
      refs: base.refs,
    })
  })

  it('says when columns were left out', async () => {
    await openChart()
    await open('資料')
    const clipboard = new DataTransfer()
    clipboard.setData('text/plain', `k\t1\t2\t3\t4\t5\t6\t7\nx\t1\t1\t1\t1\t1\t1\t1`)
    panel().querySelector('.hlx-chart-data')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }))
    await flushPromises()
    expect(panel().querySelector('[role="status"]')!.textContent).toContain('6')
  })
})

describe('the style tab', () => {
  it('sets texts, the axis, the format and the highlight, and clears them', async () => {
    await openChart({ ...base, note: 'old' })
    await open('樣式')
    await input(field('subtitle'), 'Sub')
    await input(field('xLabel'), 'Month')
    await input(field('source'), 'Src')
    await input(field('note'), '')
    await input(field('y-min'), '-10')
    await input(field('y-max'), 'abc')
    await input(field('unit'), 'ms')
    await input(field('decimals'), '1')
    await change(field<HTMLSelectElement>('highlight'), 'b')
    await change(field('stacked'), true)
    const spec = stored()
    expect(spec).toMatchObject({
      subtitle: 'Sub',
      xLabel: 'Month',
      source: 'Src',
      y: { min: -10 },
      format: { unit: 'ms', decimals: 1 },
      highlight: 'b',
      stacked: true,
    })
    expect(spec).not.toHaveProperty('note')
    expect(spec.y).not.toHaveProperty('max')
  })

  it('shows only the options that apply to the type', async () => {
    await openChart()
    await open('樣式')
    expect(field('stacked')).toBeDefined()
    expect(field('donut')).toBeUndefined()
    expect(field('y-min')).toBeDefined()
    for (const [type, present, absent] of [
      [
        'pie',
        ['donut'],
        ['stacked', 'xLabel', 'y-min', 'y-max'],
      ],
      [
        'line',
        ['xLabel', 'y-min'],
        ['stacked', 'donut'],
      ],
      [
        'area',
        ['stacked'],
        ['donut'],
      ],
    ] as const) {
      await open('設定')
      await chooseType(type)
      await open('樣式')
      for (const name of present)
        expect(field(name), `${type} ${name}`).toBeDefined()
      for (const name of absent)
        expect(field(name), `${type} ${name}`).toBeUndefined()
    }
  })

  it('says what is wrong with the axis and decimals, and keeps it out', async () => {
    await openChart({
      ...base,
      y: { min: 0 },
    })
    await open('樣式')
    await input(field('y-min'), 'abc')
    expect(field('y-min').hasAttribute('data-invalid')).toBe(true)
    expect(panel().querySelector('.hlx-chart-form [role="alert"]')!.textContent).toContain('數字')
    await leave(field('y-min'))
    expect(field('y-min').value).toBe('0')
    await input(field('y-min'), '10')
    await input(field('y-max'), '5')
    expect(field('y-max').hasAttribute('data-invalid')).toBe(true)
    expect(panel().querySelector('.hlx-chart-form [role="alert"]')!.textContent).toContain('小於')
    await input(field('decimals'), '-1')
    expect(field('decimals').hasAttribute('data-invalid')).toBe(true)
    const spec = await draftNow()
    expect(spec.y).toEqual({ min: 10 })
    expect(spec.format?.decimals).toBeUndefined()
  })

  it('turns abbreviating off and back on', async () => {
    await openChart()
    await open('樣式')
    expect(field('compact').checked).toBe(true)
    await change(field('compact'), false)
    expect((await draftNow()).format).toEqual({ compact: false })
    await open('樣式')
    await change(field('compact'), true)
    expect(await draftNow()).not.toHaveProperty('format')
  })
})

describe('pies and colors', () => {
  it('asks a pie for one value field, and keeps the other series', async () => {
    await openChart()
    await chooseType('pie')
    expect(field('series-label')).toBeUndefined()
    expect(panel().textContent).toContain('保留')
    await change(field<HTMLSelectElement>('pie-series'), 'b')
    await open('資料')
    expect([
      ...panel().querySelectorAll('[data-field="header"]'),
    ].map(item => item.getAttribute('data-key'))).toEqual(['month', 'b'])
    await open('設定')
    await chooseType('bar')
    expect(panel().querySelectorAll('[data-field="series-label"]')).toHaveLength(2)
    const spec = await draftNow()
    expect(spec.series.map((item: Json) => item.key)).toEqual(['b', 'a'])
    expect(spec.data).toEqual(base.data)
  })

  it('drops a highlight the new type can\'t use, and keeps one it can', async () => {
    await openChart({ ...base, highlight: 'b' })
    await chooseType('pie')
    expect(await draftNow()).not.toHaveProperty('highlight')
    await open('設定')
    await chooseType('bar')
    await open('樣式')
    await change(field<HTMLSelectElement>('highlight'), 'a')
    await open('設定')
    await chooseType('line')
    expect((await draftNow()).highlight).toBe('a')
  })

  it('picks colors from a palette under the swatch, showing each color, and back to automatic', async () => {
    await openChart()
    expect(swatchButton(0).getAttribute('aria-expanded')).toBe('false')
    expect(swatchButton(0).querySelector('.hlx-chart-c1')).not.toBeNull()
    expect(swatch(0, '4')).toBeNull()
    swatchButton(0).click()
    await flushPromises()
    expect(swatchButton(0).getAttribute('aria-expanded')).toBe('true')
    const four = swatch(0, '4')
    expect(four.closest('label')!.querySelector('.hlx-chart-c4')).not.toBeNull()
    expect(four.getAttribute('aria-label')).toContain('4')
    await change(four, true)
    expect((await draftNow()).series[0].color).toBe(4)
    expect(swatch(0, '4')).toBeNull()
    expect(document.activeElement).toBe(swatchButton(0))
    expect(swatchButton(0).querySelector('.hlx-chart-c4')).not.toBeNull()
    swatchButton(0).click()
    await flushPromises()
    await change(swatch(0, ''), true)
    expect((await draftNow()).series[0]).not.toHaveProperty('color')
  })

  it('opens one palette at a time', async () => {
    await openChart()
    swatchButton(0).click()
    await flushPromises()
    swatchButton(1).click()
    await flushPromises()
    expect(swatch(0, '4')).toBeNull()
    expect(swatch(1, '4')).not.toBeNull()
  })
})

describe('writing straight to the document', () => {
  it('opens on the setup tab with the focus there, and shows each edit in the chart at once', async () => {
    await openChart()
    expect(document.querySelector('.hlx-block-dialog')).toBeNull()
    expect(tab('設定').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('設定'))
    await input(field('title'), 'Now')
    expect(chartIn().querySelector('.hlx-chart-title')!.textContent).toBe('Now')
    expect(node().spec).toBe(JSON.stringify({ ...base, title: 'Now' }, null, 2))
    expect(buttonIn(panel(), '儲存')).toBeUndefined()
  })

  it('makes each edit one undo step, however many keys it took', async () => {
    await openChart()
    await input(field('title'), 'C')
    await input(field('title'), 'Changed')
    await leave(field('title'))
    await chooseType('line')
    expect(stored()).toMatchObject({ title: 'Changed', type: 'line' })
    await undo()
    expect(stored()).toMatchObject({ title: 'Changed', type: 'bar' })
    expect(typeNow()).toBe('bar')
    await undo()
    expect(stored().title).toBe('Sales')
  })

  it('takes a paste back with one undo', async () => {
    await openChart()
    await open('資料')
    const clipboard = new DataTransfer()
    clipboard.setData('text/plain', 'Month\tSales\nJan\t5\nFeb\t6\n')
    panel().querySelector('.hlx-chart-data')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }))
    await flushPromises()
    expect(stored().x).toBe('Month')
    await undo()
    expect(stored()).toEqual(base)
  })

  it('leaves the stored text alone until something changes', async () => {
    const compact = JSON.stringify(base)
    await openChart(compact)
    await open('資料')
    await open('樣式')
    panel().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(node().spec).toBe(compact)
  })

  it('turns the form off while the spec is not an object, and says where to fix it', async () => {
    await openChart('{ broken')
    expect(tab('設定').disabled).toBe(true)
    expect(tab('資料').disabled).toBe(true)
    expect(panel().textContent).toContain('原始資料')
  })
})

describe('opening and closing the panel', () => {
  it('closes on Escape, and leaves the chart picked with the focus in the editor', async () => {
    const editor = await openChart()
    panel().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(document.querySelector('.hlx-chart-panel')).toBeNull()
    expect(editor.read(() => {
      const selection = $getSelection()
      return $isNodeSelection(selection) && $isChartNode(selection.getNodes()[0])
    })).toBe(true)
    expect(document.activeElement).toBe(editor.getRootElement())
  })

  it('closes when something outside it is pressed, but not for itself or the chart', async () => {
    await openChart()
    panel().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    chartIn().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(panel()).not.toBeNull()
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(document.querySelector('.hlx-chart-panel')).toBeNull()
  })
})

describe('the toolbar', () => {
  it('shows while the chart is picked, and goes when it is not', async () => {
    const editor = await mountChart()
    expect(toolbar()).toBeNull()
    await selectChart(editor)
    expect([
      ...toolbar()!.querySelectorAll('button'),
    ].map(item => item.textContent?.trim())).toEqual(['編輯圖表', '檢視資料', '原始資料'])
    expect(chartIn().querySelector('.hlx-chart-toggle')).toBeNull()
    editor.update(() => $getRoot().getLastChildOrThrow().selectEnd(), { discrete: true })
    await flushPromises()
    expect(toolbar()).toBeNull()
  })

  it('opens the panel, and stays while it is open', async () => {
    const editor = await mountChart()
    await selectChart(editor)
    tool('編輯圖表').click()
    await flushPromises()
    expect(panel()).not.toBeNull()
    expect(tool('編輯圖表').getAttribute('aria-expanded')).toBe('true')
    editor.update(() => $setSelection(null), { discrete: true })
    await flushPromises()
    expect(toolbar()).not.toBeNull()
  })

  it('switches the chart to its data and back', async () => {
    const editor = await mountChart()
    await selectChart(editor)
    tool('檢視資料').click()
    await flushPromises()
    expect(chartIn().querySelector('table.hlx-chart-table:not(.hlx-visually-hidden)')).not.toBeNull()
    expect(tool('檢視圖表').getAttribute('aria-pressed')).toBe('true')
    tool('檢視圖表').click()
    await flushPromises()
    expect(chartIn().querySelector('.hlx-chart-plot')).not.toBeNull()
  })

  it('has no data button for a spec that is not valid', async () => {
    const editor = await mountChart('{ broken')
    await selectChart(editor)
    expect(tool('檢視資料')).toBeUndefined()
    expect(tool('原始資料')).toBeDefined()
  })

  it('is not there when read-only', async () => {
    const editor = await mountChart(base, { editable: false })
    await selectChart(editor)
    expect(toolbar()).toBeNull()
    expect(chartIn().querySelector('.hlx-chart-toggle')).not.toBeNull()
  })
})

describe('the raw data', () => {
  async function openRaw(spec: unknown = base) {
    const editor = await mountChart(spec)
    await selectChart(editor)
    tool('原始資料').click()
    await flushPromises()
    return editor
  }
  const text = () => raw()!.querySelector<HTMLTextAreaElement>('textarea')!

  it('shows the spec indented, and copies it as stored', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    await openRaw(JSON.stringify(base))
    expect(text().value).toBe(JSON.stringify(base, null, 2))
    buttonIn(raw()!, '複製').click()
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(JSON.stringify(base))
  })

  it('lists problems and won\'t apply them; applies a good spec as one undo step', async () => {
    await openRaw()
    await input(text(), JSON.stringify({ ...base, type: 'radar' }))
    expect(raw()!.querySelector('[role="alert"]')!.textContent).toContain('type')
    expect(buttonIn(raw()!, '套用').disabled).toBe(true)
    expect(stored()).toEqual(base)
    await input(text(), JSON.stringify({ ...base, title: 'From JSON' }))
    expect(raw()!.querySelector('[role="alert"]')).toBeNull()
    buttonIn(raw()!, '套用').click()
    await flushPromises()
    expect(node().spec).toBe(JSON.stringify({ ...base, title: 'From JSON' }, null, 2))
    expect(chartIn().querySelector('.hlx-chart-title')!.textContent).toBe('From JSON')
    await undo()
    expect(stored()).toEqual(base)
  })

  it('applies with ⌘Enter, and then the form works on it', async () => {
    await openRaw('{ broken')
    await input(text(), JSON.stringify({ ...base, title: 'Fixed' }))
    text().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }))
    await flushPromises()
    expect(stored().title).toBe('Fixed')
    tool('編輯圖表').click()
    await flushPromises()
    expect(raw()).toBeNull()
    expect(tab('設定').disabled).toBe(false)
    expect(field('title').value).toBe('Fixed')
  })
})

describe('laid out', () => {
  it('heads the panel with an icon and its name, over tabs that fill the width', async () => {
    await openChart()
    const head = panel().querySelector('.hlx-chart-panel-head')!
    expect(head.textContent).toContain('編輯圖表')
    expect(head.querySelector('svg')).not.toBeNull()
    expect(panel().querySelector('.hlx-chart-tabs [role="tab"][aria-selected="true"]')!.textContent?.trim()).toBe('設定')
    expect(panel().querySelector('.hlx-chart-panel-body')).not.toBeNull()
  })

  it('switches the type with four radio buttons, the current one checked', async () => {
    await openChart()
    const types = [
      ...panel().querySelectorAll<HTMLInputElement>('input[type="radio"][data-field="type"]'),
    ]
    expect(types.map(item => item.value)).toEqual(['bar', 'line', 'area', 'pie'])
    expect(types.map(item => item.closest('label')!.textContent?.trim())).toEqual(['長條', '折線', '面積', '圓餅'])
    expect(typeNow()).toBe('bar')
    expect(panel().querySelector('[role="radiogroup"][aria-label="圖表類型"]')).not.toBeNull()
    await chooseType('area')
    expect(stored().type).toBe('area')
  })

  it('puts each series on one row: swatch, name, remove', async () => {
    await openChart()
    const row = panel().querySelector('.hlx-chart-series-row')!
    expect([
      ...row.children,
    ].map(item => item.getAttribute('data-field') ?? item.tagName.toLowerCase())).toEqual(['series-swatch', 'series-label', 'button'])
  })

  it('frames the data table, marks the category in its header, and adds rows and series below it', async () => {
    await openChart()
    await open('資料')
    const frame = panel().querySelector('.hlx-chart-data-frame')!
    expect(frame.querySelector('table')).not.toBeNull()
    const category = frame.querySelector('th[data-category]')!
    expect(category.querySelector('.hlx-chart-category-mark')!.textContent).toBe('分類')
    expect(category.querySelector('input[data-field="header"]')).not.toBeNull()
    const actions = panel().querySelector('.hlx-chart-data-actions')!
    expect([
      ...actions.querySelectorAll('button'),
    ].map(item => item.textContent?.trim())).toEqual(['新增一列', '新增系列'])
    buttonIn(actions as HTMLElement, '新增系列').click()
    await flushPromises()
    expect(stored().series).toHaveLength(3)
    expect(frame.querySelectorAll('thead input[data-field="header"]')).toHaveLength(4)
  })

  it('adds no series to a pie from the data tab', async () => {
    await openChart({ ...base, type: 'pie' })
    await open('資料')
    expect(buttonIn(panel().querySelector('.hlx-chart-data-actions')!, '新增系列')).toBeUndefined()
  })

  it('heads the raw data with its name and the copy button', async () => {
    const editor = await mountChart()
    await selectChart(editor)
    tool('原始資料').click()
    await flushPromises()
    const head = raw()!.querySelector('.hlx-chart-panel-head')!
    expect(head.textContent).toContain('原始資料')
    expect(buttonIn(head as HTMLElement, '複製')).toBeDefined()
    expect(buttonIn(raw()!.querySelector('.hlx-chart-raw-actions')!, '套用')).toBeDefined()
  })

  it('gives the toolbar buttons icons', async () => {
    const editor = await mountChart()
    await selectChart(editor)
    for (const item of toolbar()!.querySelectorAll('button'))
      expect(item.querySelector('svg'), item.textContent!).not.toBeNull()
  })
})
