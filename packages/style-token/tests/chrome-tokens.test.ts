import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(`${process.cwd()}/packages/style-token/src/tokens.css`, 'utf8')

/** The declarations of the first rule whose selector is exactly `selector`. */
function rule(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`)
  expect(start, selector).toBeGreaterThanOrEqual(0)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  return new Map([
    ...body.matchAll(/(--[\w-]+):([^;]+);/g),
  ].map(([, name, value]) => [
    name,
    value.trim(),
  ]))
}

const TOKENS = [
  '--hlx-chrome-fill',
  '--hlx-chrome-fill-strong',
  '--hlx-chrome-border-subtle',
  '--hlx-chrome-text-faint',
  '--hlx-chrome-head',
  '--hlx-chrome-shadow-control',
  '--hlx-chrome-shadow-popup',
  '--hlx-chrome-ring',
  '--hlx-chrome-ring-inset',
  '--hlx-chrome-ring-room',
  '--hlx-chrome-caution',
  '--hlx-chrome-radius-sm',
  '--hlx-chrome-radius-item',
  '--hlx-chrome-radius-md',
  '--hlx-chrome-radius-lg',
  '--hlx-chrome-height-sm',
  '--hlx-chrome-height-md',
]

describe('the interface tokens', () => {
  it('are all set on .hlx-root', () => {
    const light = rule('.hlx-root')
    for (const name of TOKENS)
      expect(light.get(name), name).toBeTruthy()
  })

  it('are made of the theme tokens, so dark mode only needs its own caution', () => {
    const light = rule('.hlx-root')
    expect(Object.fromEntries([
      '--hlx-chrome-fill',
      '--hlx-chrome-border-subtle',
      '--hlx-chrome-text-faint',
      '--hlx-chrome-head',
      '--hlx-chrome-shadow-control',
      '--hlx-chrome-shadow-popup',
      '--hlx-chrome-ring',
    ].map(name => [
      name,
      light.get(name),
    ]))).toEqual({
      '--hlx-chrome-fill': 'var(--hlx-color-fill)',
      '--hlx-chrome-border-subtle': 'var(--hlx-color-border-subtle)',
      '--hlx-chrome-text-faint': 'var(--hlx-color-text-quaternary)',
      '--hlx-chrome-head': 'var(--hlx-color-bg-secondary)',
      '--hlx-chrome-shadow-control': 'var(--hlx-shadow-xs)',
      '--hlx-chrome-shadow-popup': 'var(--hlx-shadow-menu)',
      // The focus ring.
      '--hlx-chrome-ring': '0 0 0 1px var(--hlx-color-accent), 0 0 0 3px var(--hlx-color-accent-light)',
    })
    expect(light.get('--hlx-chrome-fill-strong')).toMatch(/var\(--hlx-color-/)
    const dark = rule(`.hlx-root[data-color-scheme='dark']`)
    expect(dark.get('--hlx-chrome-caution')).toBeTruthy()
    expect(dark.get('--hlx-chrome-caution')).not.toBe(light.get('--hlx-chrome-caution'))
    expect(dark.has('--hlx-chrome-shadow-popup')).toBe(false)
  })

  it('size things', () => {
    const light = rule('.hlx-root')
    expect([
      light.get('--hlx-chrome-radius-sm'),
      light.get('--hlx-chrome-radius-item'),
      light.get('--hlx-chrome-radius-md'),
      light.get('--hlx-chrome-radius-lg'),
      light.get('--hlx-chrome-height-sm'),
      light.get('--hlx-chrome-height-md'),
    ]).toEqual([
      '4px',
      '6px',
      '8px',
      '12px',
      '24px',
      '28px',
    ])
  })
})
