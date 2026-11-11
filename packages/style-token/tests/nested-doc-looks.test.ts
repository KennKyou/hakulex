import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * A nested document is a card.63 draws it (rich-ext-nested-doc/src/styles.css.ts:
 * editOverlayRoot, rendererContent and staticGradientMask), on the tokens.
 */

const CONTENT = readFileSync(`${process.cwd()}/packages/style-token/src/content.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

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
const all = rules(CONTENT)
const selectors = (list: string) => list.split(/,(?![^(]*\))\s*/).map(item => item.trim())
function value(selector: string, name: string) {
  let found: string | undefined
  for (const rule of all) {
    if (selectors(rule.selector).includes(selector) && rule.declarations.has(name))
      found = rule.declarations.get(name)
  }
  return found
}

describe('nested document card', () => {
  it('is bordered and rounded, a medium space apart', () => {
    expect(value('.hlx-root .hlx-nested-doc', 'margin')).toBe('var(--hlx-space-md) 0')
    expect(value('.hlx-root .hlx-nested-doc', 'border')).toBe('1px solid var(--hlx-color-border)')
    expect(value('.hlx-root .hlx-nested-doc', 'border-radius')).toBe('var(--hlx-radius-md)')
    expect(value('.hlx-root .hlx-nested-doc', 'overflow')).toBe('clip')
    expect(value('.hlx-root .hlx-nested-doc', 'padding')).toBeUndefined()
  })

  it('pads its content, with no outer margin on the first and last blocks', () => {
    expect(value('.hlx-root .hlx-nested-doc-body', 'padding-block')).toBe('var(--hlx-space-md)')
    expect(value('.hlx-root .hlx-nested-doc-body', 'padding-inline')).toBe('var(--hlx-space-xl)')
    expect(value('.hlx-root .hlx-nested-doc-body > :first-child', 'margin-block-start')).toBe('0')
    expect(value('.hlx-root .hlx-nested-doc-body > :last-child', 'margin-block-end')).toBe('0')
  })

  it('cuts a long one at 300px and fades its foot into the background', () => {
    const cut = '.hlx-root .hlx-nested-doc[data-collapsed] .hlx-nested-doc-body'
    // 300px in all, padding included.
    expect(value(cut, 'max-height')).toBe('300px')
    expect(value(cut, 'box-sizing')).toBe('border-box')
    expect(value(cut, 'overflow')).toBe('clip')
    expect(value(cut, 'mask-image')).toBeUndefined()
    expect(value('.hlx-root .hlx-nested-doc-body', 'position')).toBe('relative')
    const fade = '.hlx-root .hlx-nested-doc-fade'
    expect(value(fade, 'position')).toBe('absolute')
    expect(value(fade, 'inset')).toBe('auto 0 0')
    expect(value(fade, 'height')).toBe('4rem')
    expect(value(fade, 'background')).toBe('linear-gradient(to bottom, transparent, var(--hlx-color-bg))')
    expect(value(fade, 'pointer-events')).toBe('none')
  })

  it('opens from a quiet row at its foot', () => {
    const toggle = '.hlx-root .hlx-nested-doc-toggle'
    expect(value(toggle, 'border-top')).toBe('1px solid var(--hlx-color-border)')
    expect(value(toggle, 'color')).toBe('var(--hlx-color-text-tertiary)')
    expect(value(toggle, 'font-size')).toBe('var(--hlx-font-size-sm)')
    expect(value(toggle, 'padding')).toBe('var(--hlx-space-sm) var(--hlx-space-xl)')
    expect(value('.hlx-root .hlx-nested-doc-toggle:hover', 'color')).toBe('var(--hlx-color-text)')
    expect(value('.hlx-root .hlx-nested-doc-toggle:hover', 'background')).toBe('var(--hlx-color-fill-secondary)')
  })
})
