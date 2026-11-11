import type { AnnotationState, MarkerBaseState } from '@markerjs/markerjs3'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MARKER_TYPE_BY_TOOL, offsetMarkerState, STROKE_TOOLS, STROKE_WIDTHS, SWATCH_COLORS } from '../src/annotation'
import ImageEditModal from '../src/ImageEditModal.vue'
import { applyCropRebase, exportResult } from '../src/pipeline'

/*
 * Marks on the edit screen, through marker.js. As the edit screen's
 * own tests: tools on the left, their options on top, the
 * picture in the middle, the output size and the buttons below. happy-dom has no canvas, so
 * what touches pixels is replaced; the real thing is checked in the browser.
 */

vi.mock('../src/pipeline', async original => ({
  ...(await original<typeof import('../src/pipeline')>()),
  applyCropRebase: vi.fn(async () => ({ bitmapUrl: 'blob:cropped', markerState: null })),
  exportResult: vi.fn(async ({ original }: { original: File }) => new File(['edited'], original.name, { type: original.type })),
}))
/*
 * marker.js draws in an element of its own; this stand-in records what the screen asks of it.
 * Markers come and go by hand, with the events marker.js sends.
 */
const markers = vi.hoisted(() => {
  class FakeEditor {
    strokeColor = ''
    strokeWidth = 0
    fillColor = ''
    color = ''
    marker = { text: '' }
    constructor(readonly type: string) {}
    is(cls: unknown) {
      return cls === FakeTextEditor && this.type === 'TextMarker'
    }
  }
  class FakeTextEditor {}
  const areas: FakeArea[] = []
  class FakeArea extends HTMLElement {
    targetImage: HTMLImageElement | null = null
    autoZoomOut = false
    created: FakeEditor[] = []
    restored: unknown[] = []
    selectedMarkerEditors: FakeEditor[] = []
    currentMarkerEditor: FakeEditor | null = null
    state = {
      width: 1200,
      height: 800,
      version: 3,
      markers: [] as Record<string, unknown>[],
    }

    undone = 0
    redone = 0
    constructor() {
      super()
      areas.push(this)
    }

    createMarker(type: string) {
      const editor = new FakeEditor(type)
      this.created.push(editor)
      this.currentMarkerEditor = editor
      return editor
    }

    getState() {
      return structuredClone(this.state)
    }

    restoreState(state: unknown) {
      this.restored.push(state)
      this.state = structuredClone(state) as typeof this.state
    }

    get isUndoPossible() {
      return this.state.markers.length > 0
    }

    get isRedoPossible() {
      return this.undone > this.redone
    }

    undo() {
      this.undone++
      this.state.markers.pop()
    }

    redo() {
      this.redone++
      this.state.markers.push({
        typeName: 'ArrowMarker',
        x1: 0,
        y1: 0,
        x2: 10,
        y2: 10,
      })
    }

    /** As if the author drew one: marker.js adds it to its state, then says so. */
    draw(marker: Record<string, unknown>) {
      this.state.markers.push(marker)
      this.currentMarkerEditor = null
      this.dispatchEvent(new CustomEvent('markercreate'))
    }
  }
  customElements.define('fake-marker-area', FakeArea)
  return { FakeArea, FakeTextEditor, areas }
})

vi.mock('@markerjs/markerjs3', () => ({
  MarkerArea: markers.FakeArea,
  TextMarkerEditor: markers.FakeTextEditor,
  Renderer: class {},
}))

vi.mock('../src/mosaic', async original => ({
  ...(await original<typeof import('../src/mosaic')>()),
  applyMosaic: vi.fn(async () => 'blob:mosaic'),
}))

const png = () => new File(['x'], 'a.png', { type: 'image/png' })

beforeEach(() => {
  markers.areas.length = 0
  HTMLImageElement.prototype.decode = async () => {}
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  // The picture is shown at 600 × 400 from the top left of the page.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ height: 400, width: 600, x: 0, y: 0 }))
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

const screen = () => document.querySelector<HTMLElement>('.hlx-picture-editor')!

async function settle() {
  for (let i = 0; i < 4; i++)
    await flushPromises()
}

async function openWith(file = png(), natural = { width: 1200, height: 800 }) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  const wrapper = mount(ImageEditModal, {
    props: { file, onConfirm, onCancel },
    attachTo: document.body,
  })
  await settle()
  await loadPicture(natural)
  return { wrapper, onConfirm, onCancel }
}

/** The picture finished loading at this natural size, shown at 600 × 400. */
async function loadPicture(natural: { width: number, height: number }) {
  const img = screen().querySelector<HTMLImageElement>('.hlx-crop-image')!
  for (const [prop, value] of Object.entries({
    naturalWidth: natural.width,
    naturalHeight: natural.height,
    width: 600,
    height: 400,
  }))
    Object.defineProperty(img, prop, { configurable: true, value })
  img.dispatchEvent(new Event('load'))
  await settle()
}

const tool = (label: string) => screen().querySelector<HTMLButtonElement>(`.hlx-picture-editor-rail button[aria-label="${label}"]`)!
function button(text: string) {
  return [
    ...screen().querySelectorAll<HTMLButtonElement>('button'),
  ]
    .find(item => item.textContent!.trim() === text || item.getAttribute('aria-label') === text)
}

function pointer(type: string, x: number, y: number) {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: type === 'pointerup'
      ? 0
      : 1,
    clientX: x,
    clientY: y,
    pointerId: 1,
    isPrimary: true,
  })
}

async function drag(from: Element, start: [number, number], end: [number, number]) {
  from.dispatchEvent(pointer('pointerdown', ...start))
  document.dispatchEvent(pointer('pointermove', (start[0] + end[0]) / 2, (start[1] + end[1]) / 2))
  document.dispatchEvent(pointer('pointermove', ...end))
  document.dispatchEvent(pointer('pointerup', ...end))
  await settle()
}

describe('marks', () => {
  const area = () => markers.areas.at(-1)!
  const swatches = () => [
    ...screen().querySelectorAll<HTMLButtonElement>('button[aria-label^="顏色"]'),
  ]
  const widths = () => [
    ...screen().querySelectorAll<HTMLButtonElement>('button[aria-label^="粗細"]'),
  ]

  it('offers colors, widths and undo, and gets the first arrow ready in red', async () => {
    await openWith()
    tool('箭頭').click()
    await settle()
    expect(swatches().map(item => item.getAttribute('aria-label'))).toEqual([
      '顏色 #ef4444',
      '顏色 #f59e0b',
      '顏色 #22c55e',
      '顏色 #3b82f6',
      '顏色 #171717',
      '顏色 #ffffff',
    ])
    expect(widths().map(item => item.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])
    expect(button('復原')!.disabled).toBe(true)
    expect(button('重做')!.disabled).toBe(true)
    expect(area().targetImage!.getAttribute('src')).toBe('blob:test')
    expect(area().created.map(editor => editor.type)).toEqual(['ArrowMarker'])
    expect(area().created[0]).toMatchObject({ strokeColor: '#ef4444', strokeWidth: 4 })
  })

  it('has no widths for text, counters and covers', async () => {
    await openWith()
    for (const label of ['文字', '編號', '遮蓋']) {
      tool(label).click()
      await settle()
      expect(widths()).toHaveLength(0)
      expect(swatches()).toHaveLength(6)
    }
  })

  it('gets the next one ready after each, in the color picked, and undoes and redoes', async () => {
    await openWith()
    tool('方框').click()
    await settle()
    swatches()[3].click()
    await settle()
    expect(area().created.at(-1)).toMatchObject({ type: 'FrameMarker', strokeColor: '#3b82f6' })
    area().draw({
      typeName: 'FrameMarker',
      left: 10,
      top: 10,
      width: 20,
      height: 20,
    })
    await settle()
    expect(area().created).toHaveLength(3)
    expect(button('復原')!.disabled).toBe(false)

    button('復原')!.click()
    await settle()
    expect(area().state.markers).toHaveLength(0)
    expect(button('重做')!.disabled).toBe(false)
    button('重做')!.click()
    await settle()
    expect(area().state.markers).toHaveLength(1)
  })

  it('numbers counters one after another', async () => {
    await openWith()
    tool('編號').click()
    await settle()
    expect(area().created[0]).toMatchObject({
      type: 'TextMarker',
      marker: { text: '1' },
      color: '#ef4444',
    })
    area().draw({ typeName: 'TextMarker', left: 0, top: 0 })
    area().dispatchEvent(new CustomEvent('markerdeselect'))
    await new Promise(resolve => setTimeout(resolve, 0))
    await settle()
    expect(area().created.at(-1)).toMatchObject({
      type: 'TextMarker',
      marker: { text: '2' },
    })
  })

  it('keeps the marks across tools, moves them with a crop, and exports them', async () => {
    const { onConfirm } = await openWith()
    tool('方框').click()
    await settle()
    area().draw({
      typeName: 'FrameMarker',
      left: 700,
      top: 100,
      width: 50,
      height: 50,
    })
    await settle()

    tool('裁切').click()
    await settle()
    await loadPicture({ width: 1200, height: 800 })
    await drag(screen().querySelector('[data-handle="nw"]')!, [0, 0], [300, 0])
    vi.mocked(applyCropRebase).mockImplementationOnce(async (_url, rect, state) => ({
      bitmapUrl: 'blob:cropped',
      markerState: state && offsetMarkerState(state, -rect.x, -rect.y),
    }))
    tool('方框').click()
    await settle()
    const [, rect, state] = vi.mocked(applyCropRebase).mock.calls[0]
    expect(rect).toEqual({
      x: 600,
      y: 0,
      width: 600,
      height: 800,
    })
    expect(state!.markers).toHaveLength(1)
    expect(area().restored.at(-1)).toMatchObject({
      markers: [
        { left: 100, top: 100 },
      ],
    })

    button('完成')!.click()
    await settle()
    expect(vi.mocked(exportResult).mock.calls[0][0].markerState!.markers).toHaveLength(1)
    expect(onConfirm).toHaveBeenCalledWith({
      file: expect.any(File),
      summary: '已裁切 · 1 個標註',
    })
  })
})

function baseState(markers: MarkerBaseState[]): AnnotationState {
  return {
    height: 600,
    markers,
    version: 3,
    width: 800,
  }
}

describe('mARKER_TYPE_BY_TOOL', () => {
  it('maps every annotation tool to a markerjs3 type name', () => {
    expect(MARKER_TYPE_BY_TOOL).toEqual({
      arrow: 'ArrowMarker',
      counter: 'TextMarker',
      cover: 'CoverMarker',
      ellipse: 'EllipseFrameMarker',
      pen: 'FreehandMarker',
      rect: 'FrameMarker',
      text: 'TextMarker',
    })
  })
})

describe('the marks\' options', () => {
  it('has six colors and three widths, and widths only for drawn lines', () => {
    expect(SWATCH_COLORS).toEqual([
      '#ef4444',
      '#f59e0b',
      '#22c55e',
      '#3b82f6',
      '#171717',
      '#ffffff',
    ])
    expect(STROKE_WIDTHS).toEqual([2, 4, 6])
    expect([...STROKE_TOOLS].sort()).toEqual(['arrow', 'ellipse', 'pen', 'rect'])
  })
})

describe('offsetMarkerState', () => {
  it('translates rectangular markers via left/top', () => {
    const marker = {
      height: 40,
      left: 100,
      rotationAngle: 0,
      top: 50,
      typeName: 'FrameMarker',
      width: 60,
    } as MarkerBaseState
    const result = offsetMarkerState(baseState([marker]), -30, -20)
    expect(result.markers[0]).toMatchObject({
      height: 40,
      left: 70,
      top: 30,
      width: 60,
    })
  })

  it('translates linear markers via x1/y1/x2/y2', () => {
    const marker = {
      typeName: 'ArrowMarker',
      x1: 10,
      x2: 110,
      y1: 20,
      y2: 220,
    } as unknown as MarkerBaseState
    const result = offsetMarkerState(baseState([marker]), 5, -10)
    expect(result.markers[0]).toMatchObject({ x1: 15, x2: 115, y1: 10, y2: 210 })
  })

  it('translates freehand markers via nested points', () => {
    const marker = {
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 20 },
      ],
      typeName: 'FreehandMarker',
    } as unknown as MarkerBaseState
    const result = offsetMarkerState(baseState([marker]), -3, 4)
    expect(result.markers[0]).toMatchObject({
      points: [
        { x: -3, y: 4 },
        { x: 7, y: 24 },
      ],
    })
  })

  it('allows markers to move out of bounds without deleting them', () => {
    const marker = {
      height: 10,
      left: 5,
      top: 5,
      typeName: 'FrameMarker',
      width: 10,
    } as unknown as MarkerBaseState
    const result = offsetMarkerState(baseState([marker]), -100, -100)
    expect(result.markers).toHaveLength(1)
    expect(result.markers[0]).toMatchObject({ left: -95, top: -95 })
  })

  it('does not mutate the input state', () => {
    const marker = {
      left: 1,
      points: [
        { x: 1, y: 1 },
      ],
      top: 2,
      typeName: 'FreehandMarker',
    } as unknown as MarkerBaseState
    const state = baseState([marker])
    offsetMarkerState(state, 10, 10)
    expect(state.markers[0]).toMatchObject({
      left: 1,
      points: [
        { x: 1, y: 1 },
      ],
      top: 2,
    })
  })

  it('preserves annotation dimensions and untouched marker fields', () => {
    const marker = {
      left: 10,
      strokeColor: '#ef4444',
      strokeWidth: 4,
      top: 10,
      typeName: 'FrameMarker',
    } as unknown as MarkerBaseState
    const result = offsetMarkerState(baseState([marker]), 1, 1)
    expect(result.width).toBe(800)
    expect(result.height).toBe(600)
    expect(result.markers[0]).toMatchObject({ strokeColor: '#ef4444', strokeWidth: 4 })
  })
})
