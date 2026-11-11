import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ImageEditModal from '../src/ImageEditModal.vue'
import { applyMosaic } from '../src/mosaic'
import { applyCropRebase, exportResult } from '../src/pipeline'

/*
 * The edit screen: tools on the left, their options on top, the
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
const output = () => screen().querySelector('.hlx-picture-editor-size-output')?.textContent?.trim()
const sizeSelect = () => screen().querySelector<HTMLSelectElement>('.hlx-picture-editor-size select')!

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

async function select(element: HTMLSelectElement, value: string) {
  element.value = value
  element.dispatchEvent(new Event('change'))
  await settle()
}

describe('the edit screen', () => {
  it('opens on crop with the whole picture selected', async () => {
    await openWith(png(), { width: 800, height: 500 })
    expect(screen().querySelector('.hlx-picture-editor-title')!.textContent!.trim()).toBe('編輯圖片')
    expect([
      ...screen().querySelectorAll('.hlx-picture-editor-rail button'),
    ].map(item => item.getAttribute('aria-label')))
      .toEqual([
        '裁切',
        '箭頭',
        '畫筆',
        '方框',
        '橢圓',
        '文字',
        '編號',
        '遮蓋',
        '馬賽克',
      ])
    expect(tool('裁切').getAttribute('aria-pressed')).toBe('true')
    expect(button('重設裁切')!.disabled).toBe(true)
    const selection = screen().querySelector<HTMLElement>('.hlx-crop-selection')!
    expect([
      selection.style.left,
      selection.style.top,
      selection.style.width,
      selection.style.height,
    ]).toEqual(['0%', '0%', '100%', '100%'])
    expect(output()).toBe('→ 800 × 500')
    const credit = screen().querySelector<HTMLAnchorElement>('a[href="https://markerjs.com"]')!
    expect(credit.textContent).toBe('marker.js')
    expect(button('放棄編輯')).toBeTruthy()
    expect(button('完成')).toBeTruthy()
  })

  it('crops to the selection, in the picture\'s own pixels', async () => {
    const { onConfirm } = await openWith()
    await drag(screen().querySelector('[data-handle="se"]')!, [600, 400], [300, 200])
    expect(output()).toBe('→ 600 × 400')
    expect(button('重設裁切')!.disabled).toBe(false)

    button('完成')!.click()
    await settle()
    expect(vi.mocked(exportResult).mock.calls[0][0]).toMatchObject({
      pendingCropRect: { x: 0, y: 0, width: 600, height: 400 },
      maxLongEdge: null,
    })
    expect(onConfirm).toHaveBeenCalledWith({
      file: expect.any(File),
      summary: '已裁切',
    })
  })

  it('moves the selection, and draws a new one when dragging outside it', async () => {
    await openWith()
    await drag(screen().querySelector('[data-handle="se"]')!, [600, 400], [300, 200])
    await drag(screen().querySelector('.hlx-crop-selection')!, [150, 100], [300, 250])
    const selection = screen().querySelector<HTMLElement>('.hlx-crop-selection')!
    expect([
      selection.style.left,
      selection.style.top,
      selection.style.width,
      selection.style.height,
    ]).toEqual(['25%', '37.5%', '50%', '50%'])

    await drag(screen().querySelector('.hlx-crop')!, [60, 40], [120, 80])
    expect([
      selection.style.left,
      selection.style.top,
      selection.style.width,
      selection.style.height,
    ]).toEqual(['10%', '10%', '10%', '10%'])
  })

  it('resets the crop to the whole picture', async () => {
    await openWith()
    await drag(screen().querySelector('[data-handle="se"]')!, [600, 400], [300, 200])
    button('重設裁切')!.click()
    await settle()
    expect(output()).toBe('→ 1200 × 800')
    expect(button('重設裁切')!.disabled).toBe(true)
  })

  it('applies the crop when switching to another tool', async () => {
    await openWith()
    await drag(screen().querySelector('[data-handle="se"]')!, [600, 400], [300, 200])
    tool('馬賽克').click()
    await settle()
    expect(vi.mocked(applyCropRebase).mock.calls[0][1]).toEqual({ x: 0, y: 0, width: 600, height: 400 })
    expect(tool('馬賽克').getAttribute('aria-pressed')).toBe('true')
    expect(screen().querySelector<HTMLImageElement>('.hlx-crop-image')!.getAttribute('src')).toBe('blob:cropped')
  })

  it('gives back the file itself when nothing was changed', async () => {
    const file = png()
    const { onConfirm } = await openWith(file)
    vi.mocked(exportResult).mockImplementationOnce(async ({ original }) => original)
    button('完成')!.click()
    await settle()
    expect(onConfirm).toHaveBeenCalledWith({ file, summary: '' })
  })

  it('says when the picture can\'t be exported, and stays open', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { onConfirm } = await openWith()
    vi.mocked(exportResult).mockRejectedValueOnce(new Error('canvas too large'))
    button('完成')!.click()
    await settle()
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen().querySelector('[role="alert"]')!.textContent).toContain('無法輸出編輯後的圖片')
    expect(button('完成')!.disabled).toBe(false)
    error.mockRestore()
  })

  it('can only be given up when the picture can\'t be read', async () => {
    const onCancel = vi.fn()
    mount(ImageEditModal, {
      props: {
        file: png(),
        onConfirm: vi.fn(),
        onCancel,
      },
      attachTo: document.body,
    })
    await settle()
    screen().querySelector('.hlx-crop-image')!.dispatchEvent(new Event('error'))
    await settle()
    expect(screen().textContent).toContain('這張圖片無法編輯')
    expect(tool('箭頭').disabled).toBe(true)
    expect(button('完成')!.disabled).toBe(true)
    button('放棄編輯')!.click()
    expect(onCancel).toHaveBeenCalled()
  })
})

describe('mosaic', () => {
  it('pixelates the dragged area, in the picture\'s own pixels, and can be undone', async () => {
    const { onConfirm } = await openWith()
    tool('馬賽克').click()
    await settle()
    expect(button('像素化')!.getAttribute('aria-pressed')).toBe('true')
    expect(screen().textContent).toContain('16 px')
    const undo = button('復原')!
    expect(undo.disabled).toBe(true)

    await drag(screen().querySelector('.hlx-crop')!, [100, 100], [200, 160])
    expect(applyMosaic).toHaveBeenCalledOnce()
    const [, rect, mode, block] = vi.mocked(applyMosaic).mock.calls[0]
    expect(rect).toEqual({
      x: 200,
      y: 200,
      width: 200,
      height: 120,
    })
    expect([mode, block]).toEqual(['pixelate', 32])
    // The selection goes once applied.
    expect(screen().querySelector('.hlx-crop-selection')).toBeNull()
    expect(screen().querySelector<HTMLImageElement>('.hlx-crop-image')!.getAttribute('src')).toBe('blob:mosaic')
    expect(button('復原')!.disabled).toBe(false)

    button('完成')!.click()
    await settle()
    expect(onConfirm).toHaveBeenCalledWith({
      file: expect.any(File),
      summary: '1 處馬賽克',
    })
  })

  it('switches to blur with its own range, keeping the strength inside it', async () => {
    await openWith()
    tool('馬賽克').click()
    await settle()
    const range = screen().querySelector<HTMLInputElement>('input[type="range"]')!
    expect([range.min, range.max, range.value]).toEqual(['8', '48', '16'])
    range.value = '9'
    range.dispatchEvent(new Event('input'))
    await settle()
    button('模糊')!.click()
    await settle()
    const blur = screen().querySelector<HTMLInputElement>('input[type="range"]')!
    expect([blur.min, blur.max, blur.value]).toEqual(['12', '48', '12'])
    expect(screen().textContent).toContain('模糊半徑')
  })

  it('ignores a tiny drag', async () => {
    await openWith()
    tool('馬賽克').click()
    await settle()
    await drag(screen().querySelector('.hlx-crop')!, [100, 100], [101, 100])
    expect(applyMosaic).not.toHaveBeenCalled()
  })
})

describe('the output size', () => {
  it('only shrinks, from the presets or a number typed in', async () => {
    await openWith(new File(['x'], 'a.jpg', { type: 'image/jpeg' }), { width: 3000, height: 2000 })
    const options = [
      ...sizeSelect().options,
    ].map(option => [
      option.textContent!.trim(),
      option.disabled,
    ])
    expect(options).toEqual([
      ['原尺寸', false],
      ['3840 px', true],
      ['2560 px', false],
      ['1920 px', false],
      ['1280 px', false],
      ['自訂…', false],
    ])
    await select(sizeSelect(), '1920')
    expect(output()).toBe('→ 1920 × 1280')

    await select(sizeSelect(), 'custom')
    const custom = screen().querySelector<HTMLInputElement>('input[aria-label="自訂長邊（像素）"]')!
    custom.value = '6a00'
    custom.dispatchEvent(new Event('input'))
    await settle()
    expect(custom.value).toBe('600')
    expect(output()).toBe('→ 600 × 400')

    custom.value = '4000'
    custom.dispatchEvent(new Event('input'))
    await settle()
    expect(output()).toBe('→ 3000 × 2000')
  })

  it('exports at that size and says so', async () => {
    const { onConfirm } = await openWith(new File(['x'], 'a.jpg', { type: 'image/jpeg' }), { width: 3000, height: 2000 })
    await select(sizeSelect(), '1920')
    button('完成')!.click()
    await settle()
    expect(vi.mocked(exportResult).mock.calls[0][0]).toMatchObject({ maxLongEdge: 1920, pendingCropRect: null })
    expect(onConfirm).toHaveBeenCalledWith({
      file: expect.any(File),
      summary: '1920 × 1280',
    })
  })
})
