import { describe, expect, it } from 'vitest'
import { buildEditSummary } from '../src/edit-summary'

describe('buildEditSummary', () => {
  it('lists every applied edit in a fixed order', () => {
    expect(buildEditSummary({
      cropped: true,
      marks: 2,
      mosaics: 1,
      resizedTo: { height: 1080, width: 1920 },
    })).toBe('已裁切 · 2 個標註 · 1 處馬賽克 · 1920 × 1080')
  })

  it('counts a single mark', () => {
    expect(buildEditSummary({
      cropped: false,
      marks: 1,
      mosaics: 0,
      resizedTo: null,
    })).toBe('1 個標註')
  })

  it('is empty when nothing changed', () => {
    expect(buildEditSummary({
      cropped: false,
      marks: 0,
      mosaics: 0,
      resizedTo: null,
    })).toBe('')
  })
})
