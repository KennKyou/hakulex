import type { ImageEditorState } from '../src/editor-state'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, shallowRef } from 'vue'
import { isAnnotationTool, useImageEditorState } from '../src/editor-state'
import { applyMosaic, clampMosaicStrength, MOSAIC_DEFAULT_STRENGTH, MOSAIC_STRENGTH_RANGE, mosaicSampleSize } from '../src/mosaic'

const pending: ((url: string) => void)[] = []

vi.mock('../src/mosaic', async original => ({
  ...(await original<typeof import('../src/mosaic')>()),
  applyMosaic: vi.fn(() => new Promise<string>((resolve) => {
    pending.push(resolve)
  })),
}))

describe('mosaicSampleSize', () => {
  it('shrinks the region by the block size', () => {
    expect(mosaicSampleSize({ height: 40, width: 160, x: 0, y: 0 }, 16)).toEqual({ height: 3, width: 10 })
  })

  it('never collapses below one sample', () => {
    expect(mosaicSampleSize({ height: 4, width: 6, x: 0, y: 0 }, 32)).toEqual({ height: 1, width: 1 })
  })
})

describe('clampMosaicStrength', () => {
  it('keeps blur at or above its floor so text stays unrecoverable', () => {
    expect(clampMosaicStrength('blur', 4)).toBe(MOSAIC_STRENGTH_RANGE.blur.min)
    expect(MOSAIC_STRENGTH_RANGE.blur).toEqual({ min: 12, max: 48 })
    expect(MOSAIC_DEFAULT_STRENGTH.blur).toBe(20)
  })

  it('clamps pixelate into its range', () => {
    expect(MOSAIC_STRENGTH_RANGE.pixelate).toEqual({ min: 8, max: 48 })
    expect(MOSAIC_DEFAULT_STRENGTH.pixelate).toBe(16)
    expect(clampMosaicStrength('pixelate', 2)).toBe(8)
    expect(clampMosaicStrength('pixelate', 999)).toBe(48)
    expect(clampMosaicStrength('pixelate', 20)).toBe(20)
  })
})

describe('isAnnotationTool', () => {
  it('treats crop and mosaic as bitmap tools, not marker tools', () => {
    expect(isAnnotationTool('mosaic')).toBe(false)
    expect(isAnnotationTool('crop')).toBe(false)
    expect(isAnnotationTool('arrow')).toBe(true)
  })
})

describe('the editor state for mosaics', () => {
  let state: ImageEditorState
  const area = { height: 10, width: 10, x: 0, y: 0 }

  function mountState() {
    const wrapper = mount(defineComponent({
      setup() {
        state = useImageEditorState(shallowRef('blob:original'))
        state.naturalSize.value = { height: 100, width: 100 }
        return () => null
      },
    }))
    return wrapper
  }

  afterEach(() => {
    pending.length = 0
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('ignores a second mosaic while one is still applying', async () => {
    mountState()
    void state.applyMosaicArea(area, 'pixelate', 16)
    void state.applyMosaicArea(area, 'pixelate', 16)
    await flushPromises()
    expect(pending).toHaveLength(1)
    expect(state.mosaicBusy.value).toBe(true)

    pending[0]('blob:m1')
    await flushPromises()
    expect(state.mosaicBusy.value).toBe(false)
    expect(state.sourceUrl.value).toBe('blob:m1')
    expect(state.mosaicCount.value).toBe(1)
  })

  it('chains mosaics on the latest bitmap, and undoes them one at a time', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    mountState()
    void state.applyMosaicArea(area, 'pixelate', 16)
    await flushPromises()
    pending[0]('blob:m1')
    await flushPromises()
    void state.applyMosaicArea(area, 'blur', 20)
    await flushPromises()
    pending[1]('blob:m2')
    await flushPromises()

    expect(vi.mocked(applyMosaic).mock.calls[1][0]).toBe('blob:m1')
    expect(state.mosaicCount.value).toBe(2)

    state.undoMosaic()
    expect(state.sourceUrl.value).toBe('blob:m1')
    expect(revoke).toHaveBeenCalledWith('blob:m2')
    state.undoMosaic()
    expect(state.sourceUrl.value).toBe('blob:original')
    expect(state.mosaicCount.value).toBe(0)
  })

  it('revokes a mosaic that resolves after unmount', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const wrapper = mountState()
    void state.applyMosaicArea(area, 'pixelate', 16)
    await flushPromises()
    wrapper.unmount()
    pending[0]('blob:late')
    await flushPromises()
    expect(revoke).toHaveBeenCalledWith('blob:late')
  })
})
