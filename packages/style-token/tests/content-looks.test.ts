import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * Inline elements, lists, checkboxes, quotes, rules and captions look
 * (rich-editor/src/styles/shared.css.ts and article.css.ts), colored by the tokens.
 */

const CONTENT = readFileSync(`${process.cwd()}/packages/style-token/src/content.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const EDITOR = readFileSync(`${process.cwd()}/packages/editor/src/styles/editor.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** Flat rules: an at-rule's own selector is kept in front, so a rule inside @supports can be found. */
function rules(css: string) {
  const found: { selector: string, declarations: Map<string, string> }[] = []
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    found.push({
      selector: selector.trim().replace(/\s+/g, ' '),
      declarations: new Map([
        ...body.matchAll(/([\w-]+)\s*:([^;]+);/g),
      ].map(([, name, value]) => [
        name.trim(),
        value.trim(),
      ])),
    })
  }
  return found
}
const content = rules(CONTENT)
const editor = rules(EDITOR)
/** A selector list's selectors: split on commas, but not those inside `:not(…)` and the like. */
const selectors = (list: string) => list.split(/,(?![^(]*\))\s*/).map(item => item.trim())
/** The value the last rule naming `selector` gives `name`; with `first`, the first rule. */
function value(selector: string, name: string, from = content, first = false) {
  let found: string | undefined
  for (const rule of from) {
    if (selectors(rule.selector).includes(selector) && rule.declarations.has(name)) {
      found = rule.declarations.get(name)
      if (first)
        return found
    }
  }
  return found
}

describe('inline elements', () => {
  it('underline links', () => {
    expect(value('.hlx-root .hlx-link', 'color')).toBe('var(--hlx-color-link)')
    expect(value('.hlx-root .hlx-link', 'text-decoration-thickness')).toBe('1px')
    expect(value('.hlx-root .hlx-link', 'text-underline-offset')).toBe('0.22em')
    expect(value('.hlx-root .hlx-link', 'text-decoration-color')).toBe('color-mix(in oklab, var(--hlx-color-link) 35%, transparent)')
    expect(value('.hlx-root .hlx-link:hover', 'text-decoration-color')).toBe('var(--hlx-color-link)')
  })

  it('sweep a highlight in with the accent\'s tint as it scrolls in, and show it at once while editing', () => {
    expect(value('.hlx-root .hlx-highlight', '--hlx-highlight-color')).toBe('var(--hlx-color-accent-light)')
    expect(value('.hlx-root .hlx-highlight', 'background')).toBe('linear-gradient(120deg, var(--hlx-highlight-color) 50%, transparent 50%) 110% 0 / 200% 100% no-repeat')
    expect(value('.hlx-root .hlx-highlight', 'background-position')).toBe('calc((1 - var(--hlx-highlighted)) * 110%) 0')
    // Shown, unless the browser can sweep it in, which @supports below starts from 0.
    expect(value('.hlx-root .hlx-highlight', '--hlx-highlighted', content, true)).toBe('1')
    expect(CONTENT).toMatch(/@supports \(animation-timeline: view\(\)\)\s*\{\s*\.hlx-root \.hlx-highlight\s*\{[^}]*animation-timeline: view\(\);/)
    expect(value('.hlx-root [contenteditable=\'true\'] .hlx-highlight', '--hlx-highlighted')).toBe('1')
    expect(value('.hlx-root [contenteditable=\'true\'] .hlx-highlight', 'animation')).toBe('none')
  })

  it('mask a spoiler with the third text color for readers, and tint it while editing', () => {
    const hidden = '.hlx-root .hlx-spoiler--hidden:not(:hover, :focus-visible, [contenteditable=\'true\'] *)'
    expect(value(hidden, 'background')).toBe('var(--hlx-color-text-tertiary)')
    expect(value(hidden, 'color')).toBe('transparent')
    expect(value('.hlx-root .hlx-spoiler', 'border-radius')).toBe('var(--hlx-radius-sm)')
    expect(value('.hlx-root .hlx-spoiler', 'padding-inline')).toBe('4px')
    expect(value('.hlx-root [contenteditable=\'true\'] .hlx-spoiler', 'background')).toBe('color-mix(in srgb, var(--hlx-color-text) 30%, transparent)')
    expect(value('.hlx-root [contenteditable=\'true\'] .hlx-spoiler', 'color')).toBe('inherit')
    // Nothing in the editor's own styles paints over it.
    expect(editor.filter(rule => /\.hlx-spoiler\b/.test(rule.selector) && rule.declarations.has('background'))).toEqual([])
  })

  it('draw a mention as a chip', () => {
    expect(value('.hlx-root .hlx-mention', 'border-radius')).toBe('999px')
    expect(value('.hlx-root .hlx-mention', 'background')).toBe('var(--hlx-color-bg-secondary)')
    expect(value('.hlx-root .hlx-mention', 'border')).toBe('1px solid var(--hlx-color-border)')
    expect(value('.hlx-root .hlx-mention', 'padding')).toBe('0.05em 0.55em')
    expect(value('.hlx-root .hlx-mention', 'font-size')).toBe('var(--hlx-font-size-sm)')
    expect(value('.hlx-root .hlx-mention', 'color')).toBe('var(--hlx-color-text)')
    expect(value('.hlx-root .hlx-mention-handle', 'font-weight')).toBe('500')
    expect(value('.hlx-root .hlx-mention-handle', 'color')).toBe('inherit')
    expect(value('.hlx-root .hlx-mention-handle', 'text-decoration')).toBe('none')
    expect(value('.hlx-root .hlx-mention--plain', 'color')).toBe('var(--hlx-color-text-secondary)')
    expect(value('.hlx-root .hlx-mention-icon svg', 'width')).toBe('0.85em')
  })

  it('show an HTML comment in small type, on the code color, between its markers', () => {
    expect(value('.hlx-editor .hlx-comment', 'font-family', editor)).toBe('var(--hlx-font-mono)')
    expect(value('.hlx-editor .hlx-comment', 'border', editor)).toMatch(/dashed/)
    expect(value('.hlx-editor .hlx-comment::before', 'content', editor)).toMatch(/<!--/)
    expect(value('.hlx-editor .hlx-comment::after', 'content', editor)).toMatch(/-->/)
  })
})

describe('blocks', () => {
  it('letter nested ordered lists, and indent plain items a little', () => {
    expect(value('.hlx-root .hlx-listitem-nested .hlx-ol', 'list-style-type')).toBe('lower-alpha')
    expect(value('.hlx-root .hlx-listitem-nested .hlx-ul', 'list-style-type')).toBe('circle')
    // Every deeper level keeps the circle: there is no third shape.
    expect(CONTENT).not.toMatch(/square/)
    expect(value('.hlx-root .hlx-listitem:not(.hlx-listitem-checked, .hlx-listitem-unchecked)', 'padding-left')).toBe('0.25em')
  })

  it('draw a checkbox', () => {
    const box = '.hlx-root .hlx-listitem-checked::before'
    expect(value('.hlx-root .hlx-listitem-unchecked::before', 'width')).toBe('var(--hlx-checkbox-size)')
    expect(value('.hlx-root .hlx-listitem-unchecked', '--hlx-checkbox-size')).toBe('1.125rem')
    expect(value('.hlx-root .hlx-listitem-unchecked', 'padding-left')).toBe('2em')
    expect(value('.hlx-root .hlx-listitem-unchecked::before', 'border')).toBe('1.5px solid var(--hlx-color-text-quaternary)')
    expect(value('.hlx-root .hlx-listitem-unchecked::before', 'border-radius')).toBe('var(--hlx-radius-sm)')
    expect(value(box, 'border-color')).toBe('var(--hlx-color-text)')
    expect(value(box, 'background')).toBe('var(--hlx-color-text)')
    expect(value('.hlx-root .hlx-listitem-checked', 'color')).toBe('var(--hlx-color-text-tertiary)')
    expect(value('.hlx-root .hlx-listitem-checked', 'text-decoration-color')).toBe('var(--hlx-color-text-quaternary)')
  })

  it('bar a quote with a 2px line, its first and last paragraphs flush', () => {
    expect(value('.hlx-root .hlx-quote::before', 'width')).toBe('2px')
    expect(value('.hlx-root .hlx-quote::before', 'background')).toBe('var(--hlx-color-quote-border)')
    expect(value('.hlx-root .hlx-quote', 'padding-left')).toBe('1.125em')
    expect(value('.hlx-root .hlx-quote', 'border-left')).toBeUndefined()
    expect(value('.hlx-root .hlx-quote > .hlx-paragraph:first-child', 'margin-top')).toBe('0')
    expect(value('.hlx-root .hlx-quote > .hlx-paragraph:last-child', 'margin-bottom')).toBe('0')
  })

  it('draw an article\'s rule as a short line in the middle, with the next block right after its space', () => {
    expect(value('.hlx-root .hlx-hr', 'width')).toBe('60px')
    expect(value('.hlx-root .hlx-hr', 'margin')).toBe('var(--hlx-space-lg) auto')
    expect(value('.hlx-root .hlx-hr', 'border-top')).toBe('1px solid var(--hlx-color-hr-border)')
    expect(value('.hlx-root:not([data-variant]) .hlx-hr, .hlx-root[data-variant=\'article\'] .hlx-hr'.split(', ')[1], 'margin')).toBe('3.5em auto')
    expect(value('.hlx-root[data-variant=\'article\'] .hlx-hr-block + *', 'margin-top')).toBe('0')
  })

  it('set captions small, in the third text color', () => {
    expect(value('.hlx-root .hlx-image-caption', 'color')).toBe('var(--hlx-color-text-tertiary)')
    expect(value('.hlx-root .hlx-image-caption', 'font-size')).toBe('var(--hlx-font-size-caption)')
    expect(value('.hlx-root .hlx-image-caption', 'line-height')).toBe('var(--hlx-line-height-compact)')
    expect(value('.hlx-root .hlx-image-caption', 'margin-top')).toBe('1em')
  })
})
