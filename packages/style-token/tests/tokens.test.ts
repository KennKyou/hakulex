import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HOSTED_TOKENS, themeStyle, TOKEN_GROUPS, tokenValues } from '../src'

const css = readFileSync(`${process.cwd()}/packages/style-token/src/tokens.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** The declarations of the rule whose selector is exactly `selector`. */
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
/** What a declaration gives when the site sets nothing: the fallback of a host variable. */
function plain(value: string | undefined) {
  const hosted = value?.match(/^var\(--hlx-host-[\w-]+, ([\s\S]+)\)$/)
  return hosted ? hosted[1] : value
}
const all = Object.values(TOKEN_GROUPS).flatMap(group => Object.values(group))
const ROOT = '.hlx-root'
const DARK = `.hlx-root[data-color-scheme='dark']`
const variant = (name: string) => `.hlx-root[data-variant='${name}']`

describe('the token set', () => {
  it('has every token, with the light article values', () => {
    const root = rule(ROOT)
    for (const name of all)
      expect(plain(root.get(name)), name).toBe(tokenValues('article', 'light')[name])
    // Written out here, not read from the table being tested.
    expect(Object.fromEntries([
      '--hlx-color-text',
      '--hlx-color-text-secondary',
      '--hlx-color-text-tertiary',
      '--hlx-color-text-quaternary',
      '--hlx-color-bg-secondary',
      '--hlx-color-fill',
      '--hlx-color-border-subtle',
      '--hlx-color-quote-bg',
      '--hlx-color-alert-warning',
      '--hlx-space-md',
      '--hlx-flow-paragraph',
      '--hlx-flow-list',
      '--hlx-flow-block',
      '--hlx-flow-heading',
      '--hlx-font-size-code',
      '--hlx-font-size-base',
      '--hlx-line-height',
      '--hlx-line-height-code',
      '--hlx-radius-md',
      '--hlx-max-width',
    ].map(name => [
      name,
      plain(root.get(name)),
    ]))).toEqual({
      '--hlx-color-text': '#171717',
      '--hlx-color-text-secondary': '#404040',
      '--hlx-color-text-tertiary': '#737373',
      '--hlx-color-text-quaternary': '#a3a3a3',
      '--hlx-color-bg-secondary': '#fafafa',
      '--hlx-color-fill': 'rgb(0 0 0 / 0.07)',
      '--hlx-color-border-subtle': '#f0f0f0',
      '--hlx-color-quote-bg': '#f5f5f5',
      '--hlx-color-alert-warning': '#b45309',
      '--hlx-space-md': '16px',
      '--hlx-flow-paragraph': '1.25em',
      '--hlx-flow-list': '0.375em',
      '--hlx-flow-block': '2em',
      '--hlx-flow-heading': '2em',
      '--hlx-font-size-code': '0.8125em',
      '--hlx-font-size-base': '16px',
      '--hlx-line-height': '1.75',
      '--hlx-line-height-code': '1.7',
      '--hlx-radius-md': '8px',
      '--hlx-max-width': '700px',
    })
  })

  it('keeps its fonts, with the Traditional Chinese faces first', () => {
    const root = rule(ROOT)
    const sans = plain(root.get('--hlx-font-family-sans'))!
    expect(sans.indexOf('"PingFang TC"')).toBeLessThan(sans.indexOf('"PingFang SC"'))
    for (const face of [
      '-apple-system',
      '"Segoe UI"',
      '"Hiragino Sans GB"',
      '"Microsoft YaHei"',
      '"Noto Sans SC"',
      'sans-serif',
    ])
      expect(sans).toContain(face)
    expect(plain(root.get('--hlx-font-family'))).toBe('var(--hlx-font-family-sans)')
    expect(plain(root.get('--hlx-font-family-serif'))).toContain('"Noto Serif TC"')
    expect(plain(root.get('--hlx-font-mono'))).toMatch(/^"SF Mono"/)
  })

  it('switches colors and shadows only, for dark', () => {
    const dark = rule(DARK)
    expect(plain(dark.get('--hlx-color-text'))).toBe('#ededed')
    expect(plain(dark.get('--hlx-color-bg'))).toBe('#0a0a0a')
    expect(plain(dark.get('--hlx-color-text-secondary'))).toBe('#c4c4c4')
    expect(plain(dark.get('--hlx-color-alert-tip'))).toBe('#4ade80')
    expect(dark.get('--hlx-shadow-menu')).toBe(tokenValues('article', 'dark')['--hlx-shadow-menu'])
    // Colors only: its own, the interface's caution and the syntax colors; no fonts, sizes or spacing.
    for (const name of dark.keys())
      expect(name, name).toMatch(/^--hlx-(?:color-|shadow-|chrome-caution$|syntax-)/)
    for (const name of Object.values(TOKEN_GROUPS.color))
      expect(plain(dark.get(name)), name).toBe(tokenValues('article', 'dark')[name])
    // Last, so it beats a variant's own colors: comment's lighter quote is a light-mode tweak.
    expect(css.lastIndexOf(`${DARK} {`)).toBeGreaterThan(css.lastIndexOf(`${variant('comment')} {`))
  })

  it.each([
    [
      'note',
      { '--hlx-font-family': 'var(--hlx-font-family-serif)', '--hlx-line-height': '1.85', '--hlx-flow-paragraph': '0.5em' },
    ],
    [
      'comment',
      {
        '--hlx-font-size-base': '14px',
        '--hlx-line-height': '1.6',
        '--hlx-flow-paragraph': '0.6em',
        '--hlx-flow-block': '1em',
        '--hlx-space-md': '10px',
        '--hlx-radius-md': '6px',
        '--hlx-max-width': 'none',
      },
    ],
    [
      'chat',
      {
        '--hlx-font-size-base': '15px',
        '--hlx-line-height': '1.65',
        '--hlx-flow-paragraph': '0.75em',
        '--hlx-flow-list': '0.25em',
        '--hlx-font-size-code': '0.8667em',
      },
    ],
  ])('gives the %s variant its layout', (name, expected) => {
    const own = rule(variant(name))
    for (const [token, value] of Object.entries(expected)) {
      expect(plain(own.get(token)), token).toBe(value)
      expect(tokenValues(name as 'note', 'light')[token], token).toBe(value)
      expect(tokenValues(name as 'note', 'dark')[token], token).toBe(value)
    }
  })

  it('reads the site\'s own colors and fonts first', () => {
    const root = rule(ROOT)
    for (const name of HOSTED_TOKENS)
      expect(root.get(name), name).toBe(`var(${name.replace('--hlx-', '--hlx-host-')}, ${tokenValues('article', 'light')[name]})`)
    expect(HOSTED_TOKENS).toContain('--hlx-color-accent')
    expect(HOSTED_TOKENS).toContain('--hlx-font-family-serif')
    expect(HOSTED_TOKENS).not.toContain('--hlx-space-md')
    expect(rule(DARK).get('--hlx-color-accent')).toBe('var(--hlx-host-color-accent, #60a5fa)')
  })

  it('keeps the names it had, pointing at the new tokens', () => {
    const root = rule(ROOT)
    expect(Object.fromEntries([
      '--hlx-color-text-muted',
      '--hlx-color-bg-subtle',
      '--hlx-font-sans',
      '--hlx-font-serif',
      '--hlx-font-size',
    ].map(name => [
      name,
      root.get(name),
    ]))).toEqual({
      '--hlx-color-text-muted': 'var(--hlx-color-text-tertiary)',
      '--hlx-color-bg-subtle': 'var(--hlx-color-bg-tertiary)',
      '--hlx-font-sans': 'var(--hlx-font-family-sans)',
      '--hlx-font-serif': 'var(--hlx-font-family-serif)',
      '--hlx-font-size': 'var(--hlx-font-size-base)',
    })
  })
})

describe('themeStyle', () => {
  it('turns token overrides into CSS variables', () => {
    expect(themeStyle({
      color: { accent: '#171717', textSecondary: '#262626' },
      space: { md: '12px' },
      typography: { fontFamilySerif: 'serif' },
      shadow: { topBar: 'none' },
    })).toEqual({
      '--hlx-color-accent': '#171717',
      '--hlx-color-text-secondary': '#262626',
      '--hlx-space-md': '12px',
      '--hlx-font-family-serif': 'serif',
      '--hlx-shadow-top-bar': 'none',
    })
  })

  it('ignores names it doesn\'t know and values that aren\'t text, and gives nothing for nothing', () => {
    expect(themeStyle({
      color: { accent: 3, nope: '#000' },
      nope: { x: '1' },
    } as never)).toEqual({})
    expect(themeStyle({})).toEqual({})
    expect(themeStyle(undefined)).toEqual({})
  })
})
