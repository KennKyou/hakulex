import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * A code block looks: a card on the code color,
 * a 36px header with the language's icon and a copy button, and line numbers.
 */

const CONTENT = readFileSync(`${process.cwd()}/packages/style-token/src/content.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const EDITOR = readFileSync(`${process.cwd()}/packages/editor/src/styles/editor.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
function parse(css: string) {
  return [
    ...css.matchAll(/([^{}]+)\{([^{}]*)\}/g),
  ].map(([, selector, body]) => ({
    selector: selector.trim().replace(/\s+/g, ' '),
    declarations: new Map([
      ...body.matchAll(/([\w-]+)\s*:([^;]+);/g),
    ].map(([, name, value]) => [
      name.trim(),
      value.trim(),
    ])),
  }))
}
const selectors = (list: string) => list.split(/,(?![^(]*\))\s*/).map(item => item.trim())
function value(selector: string, name: string, css = CONTENT) {
  let found: string | undefined
  for (const rule of parse(css)) {
    if (selectors(rule.selector).includes(selector) && rule.declarations.has(name))
      found = rule.declarations.get(name)
  }
  return found
}

describe('a code block', () => {
  it('is a card on the code color, in the code size and line height', () => {
    const card = '.hlx-root .hlx-code-card'
    expect(value(card, 'border')).toBe('1px solid var(--hlx-color-border-subtle)')
    expect(value(card, 'border-radius')).toBe('var(--hlx-radius-md)')
    expect(value(card, 'background')).toBe('var(--hlx-color-code-bg)')
    expect(value(card, 'color')).toBe('var(--hlx-color-text)')
    expect(value('.hlx-root .hlx-code-body', 'font-size')).toBe('var(--hlx-font-size-code)')
    expect(value('.hlx-root .hlx-code-body', 'line-height')).toBe('var(--hlx-line-height-code)')
  })

  it('has a 36px header with the language\'s icon and name, and a quiet copy button', () => {
    const header = '.hlx-root .hlx-code-header'
    expect(value(header, 'height')).toBe('36px')
    expect(value(header, 'padding')).toBe('0 6px 0 14px')
    expect(value(header, 'background')).toBe('var(--hlx-color-code-header-bg)')
    expect(value(header, 'border-bottom')).toBe('1px solid var(--hlx-color-border-subtle)')
    expect(value(header, 'color')).toBe('var(--hlx-color-text-tertiary)')
    expect(value('.hlx-root .hlx-code-lang', 'gap')).toBe('8px')
    expect(value('.hlx-root .hlx-code-lang-icon', 'width')).toBe('14px')
    expect(value('.hlx-root .hlx-code-copy', 'padding')).toBe('6px 8px')
    expect(value('.hlx-root .hlx-code-copy', 'border-radius')).toBe('6px')
    expect(value('.hlx-root .hlx-code-copy', 'gap')).toBe('6px')
    expect(value('.hlx-root .hlx-code-copy:hover', 'background')).toBe('var(--hlx-color-fill-secondary)')
    expect(value('.hlx-root .hlx-code-copy:hover', 'color')).toBe('var(--hlx-color-text)')
  })

  it('numbers its lines in the fourth text color, held at the left as it scrolls', () => {
    const number = '.hlx-root .hlx-code-lined .hlx-code-line::before'
    expect(value('.hlx-root .hlx-code-lined', 'counter-reset')).toBe('hlx-code-line')
    expect(value('.hlx-root .hlx-code-lined .hlx-code-line', 'counter-increment')).toBe('hlx-code-line')
    expect(value(number, 'content')).toBe('counter(hlx-code-line)')
    expect(value(number, 'color')).toBe('var(--hlx-color-text-quaternary)')
    expect(value(number, 'position')).toBe('sticky')
    expect(value(number, 'left')).toBe('0')
    expect(value(number, 'min-width')).toBe('calc(var(--hlx-line-digits, 2) * 1ch)')
    expect(value(number, 'text-align')).toBe('right')
    // The editor's CodeMirror numbers them the same way.
    expect(value('.hlx-editor .hlx-code-card .cm-gutters', 'color', EDITOR)).toBe('var(--hlx-color-text-quaternary)')
    expect(value('.hlx-editor .hlx-code-card .cm-gutters', 'background', EDITOR)).toBe('var(--hlx-color-code-bg)')
  })
})
