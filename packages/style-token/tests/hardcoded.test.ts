import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * The styles use the tokens: no color is written into them except where a fixed one is the
 * point, and the content's rhythm comes through the flow tokens.
 */

/** Every rule in a style file, comments gone, as selector and declarations in order. */
function rules(path: string) {
  const css = readFileSync(`${process.cwd()}/${path}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  return [
    ...css.matchAll(/([^{}]+)\{([^{}]*)\}/g),
  ].map(([, selector, body]) => ({
    selector: selector.trim().replace(/\s+/g, ' '),
    declarations: [
      ...body.matchAll(/([\w-]+)\s*:([^;]+);/g),
    ].map(([, name, value]) => ({
      name: name.trim(),
      value: value.trim(),
    })),
  }))
}

const COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(|\b(?:white|black|red|green|blue|yellow|orange|gray|grey)\b/i

/** Where a fixed color is the point: what it is for, by selector and property. */
const FIXED: Record<string, { selector: RegExp, name?: RegExp, why: string }[]> = {
  'packages/style-token/src/content.css': [
    { selector: /\.hlx-tag\b/, why: 'a tag is colored by its own hue' },
    { selector: /\.hlx-highlight\b/, why: 'a highlighter is yellow in either scheme' },
    { selector: /\.hlx-video\b/, name: /^background$/, why: 'a video is letterboxed in black' },
    { selector: /^\.hlx-root(?:\[data-color-scheme='dark'\])?$/, name: /^--hlx-chart-/, why: 'the chart palette' },
    { selector: /./, name: /^(?:-webkit-)?mask-image$/, why: 'a mask\'s black is how opaque it is, not a color' },
    { selector: /\.hlx-chart-slice-label\b/, why: 'labels on colored slices are white' },
  ],
}

describe('written-in colors', () => {
  it.each(Object.keys(FIXED))('%s has none but where a fixed color is the point', (path) => {
    const found: string[] = []
    for (const { selector, declarations } of rules(path)) {
      for (const { name, value } of declarations) {
        if (!COLOR.test(value))
          continue
        // Values made of tokens: a mix with a token keeps following the theme.
        if (/^color-mix\(/.test(value) && !/#[0-9a-f]{3,8}\b/i.test(value) && /var\(--hlx-/.test(value))
          continue
        const fixed = FIXED[path].some(rule => rule.selector.test(selector) && (!rule.name || rule.name.test(name)))
        if (!fixed)
          found.push(`${selector} { ${name}: ${value} }`)
      }
    }
    expect(found).toEqual([])
  })
})

describe('the content\'s rhythm', () => {
  const content = rules('packages/style-token/src/content.css')
  /** The value a selector's own rules give a property, the last one winning. */
  function value(selector: string, name: string) {
    let found: string | undefined
    for (const rule of content) {
      if (rule.selector.split(', ').includes(selector)) {
        for (const declaration of rule.declarations) {
          if (declaration.name === name)
            found = declaration.value
        }
      }
    }
    return found
  }

  it('spaces paragraphs, lists and their items', () => {
    expect(value('.hlx-root .hlx-paragraph', 'margin')).toBe('0 0 var(--hlx-flow-paragraph)')
    expect(value('.hlx-root .hlx-list', 'margin')).toBe('0 0 var(--hlx-flow-paragraph)')
    expect(value('.hlx-root .hlx-listitem', 'margin')).toBe('0 0 var(--hlx-flow-list)')
    expect(value('.hlx-root .hlx-listitem::marker', 'color')).toBe('var(--hlx-color-text-tertiary)')
    expect(value('.hlx-root .hlx-list .hlx-list', 'margin')).toBe('var(--hlx-flow-list) 0 0')
    expect(value('.hlx-content > :first-child', 'margin-top')).toBe('0')
  })

  it.each([
    [
      'h1',
      '1.875em',
      '700',
      '1.2667',
      1.25 / 1.875,
      '0.6em',
    ],
    [
      'h2',
      '1.5em',
      '650',
      '1.3333',
      1.1 / 1.5,
      '0.5em',
    ],
    [
      'h3',
      '1.25em',
      '600',
      '1.4',
      1 / 1.25,
      '0.4em',
    ],
    [
      'h4',
      '1.0625em',
      '600',
      '1.5294',
      0.9 / 1.0625,
      '0.35em',
    ],
    [
      'h5',
      '1em',
      '600',
      'var(--hlx-line-height-tight)',
      0.9 / 1,
      '0.3em',
    ],
    [
      'h6',
      '0.875em',
      '600',
      'var(--hlx-line-height-tight)',
      0.9 / 0.875,
      '0.25em',
    ],
  ])('sizes and spaces an %s', (level, size, weight, height, ratio, below) => {
    const selector = `.hlx-root .hlx-${level}`
    expect(value(selector, 'font-size')).toBe(size)
    expect(value(selector, 'font-weight')).toBe(weight)
    expect(value(selector, 'line-height')).toBe(height)
    expect(value(selector, 'margin-top')).toBe(`calc(var(--hlx-flow-heading) * ${Number(ratio.toFixed(4))})`)
    expect(value(selector, 'margin-bottom')).toBe(below)
  })

  it.each([
    '.hlx-root .hlx-quote',
    '.hlx-root .hlx-code-block',
    '.hlx-root .hlx-image-block',
    '.hlx-root .hlx-video-block',
    '.hlx-root .hlx-file-block',
    '.hlx-root .hlx-alert',
    '.hlx-root .hlx-banner',
    '.hlx-root .hlx-table-wrap',
    '.hlx-root .hlx-math-block',
    '.hlx-root .hlx-mermaid-block',
    '.hlx-root .hlx-chart',
    '.hlx-root .hlx-poll',
    '.hlx-root .hlx-link-card',
    '.hlx-root .hlx-embed',
    '.hlx-root .hlx-dynamic',
    '.hlx-root .hlx-steps',
    '.hlx-root .hlx-snippet-block',
    '.hlx-root .hlx-gallery-block',
    '.hlx-root .hlx-chat-block',
    '.hlx-root .hlx-grid',
    // Not a collapsible block or a nested document: those are kept --hlx-space-md apart
    // (details.css.ts, rich-ext-nested-doc/src/styles.css.ts).
  ])('keeps %s a block apart', (selector) => {
    expect(value(selector, 'margin') ?? value(selector, 'margin-block'), selector).toMatch(/^var\(--hlx-flow-block\) 0$|^var\(--hlx-flow-block\)$/)
  })

  it('colors quotes and code with their tokens', () => {
    expect(value('.hlx-root .hlx-quote', 'color')).toBe('var(--hlx-color-text-secondary)')
    expect(value('.hlx-root .hlx-quote-attribution', 'color')).toBe('var(--hlx-color-text-tertiary)')
    expect(value('.hlx-root .hlx-quote-attribution', 'font-size')).toBe('var(--hlx-font-size-caption)')
    expect(value('.hlx-root .hlx-code', 'background')).toBe('var(--hlx-color-code-bg)')
    expect(value('.hlx-root .hlx-code', 'border-radius')).toBe('var(--hlx-radius-sm)')
    expect(value('.hlx-root .hlx-alert[data-type=\'note\']', '--hlx-callout-color') ?? value('.hlx-root .hlx-alert', '--hlx-callout-color')).toBe('var(--hlx-color-alert-info)')
  })
})
