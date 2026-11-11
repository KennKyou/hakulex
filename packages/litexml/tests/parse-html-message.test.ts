import { describe, expect, it, vi } from 'vitest'

describe('parseHTML before an implementation is registered', () => {
  it('points at this package\'s main entry', async () => {
    vi.resetModules()
    const { parseHTML } = await import('../src/parse-html')
    expect(() => parseHTML('<p></p>')).toThrow('Import from the main entry (@hakulex/litexml)')
  })
})
