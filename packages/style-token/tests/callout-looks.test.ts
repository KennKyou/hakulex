import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * Alerts and banners look:
 * a 2px bar and a small heading with the type's icon; a tinted card with the icon beside it.
 */

const CSS = readFileSync(`${process.cwd()}/packages/style-token/src/content.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const rules = [
  ...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g),
].map(([, selector, body]) => ({
  selector: selector.trim().replace(/\s+/g, ' '),
  declarations: new Map([
    ...body.matchAll(/([\w-]+)\s*:([^;]+);/g),
  ].map(([, name, value]) => [
    name.trim(),
    value.trim(),
  ])),
}))
const selectors = (list: string) => list.split(/,(?![^(]*\))\s*/).map(item => item.trim())
function value(selector: string, name: string) {
  let found: string | undefined
  for (const rule of rules) {
    if (selectors(rule.selector).includes(selector) && rule.declarations.has(name))
      found = rule.declarations.get(name)
  }
  return found
}

describe('an alert', () => {
  it('has a 2px bar of its type\'s color, and room for it', () => {
    expect(value('.hlx-root .hlx-alert', 'padding')).toBe('2px 0 2px 18px')
    expect(value('.hlx-root .hlx-alert', 'border-inline-start')).toBeUndefined()
    expect(value('.hlx-root .hlx-alert::before', 'width')).toBe('2px')
    expect(value('.hlx-root .hlx-alert::before', 'border-radius')).toBe('1px')
    expect(value('.hlx-root .hlx-alert::before', 'background')).toBe('var(--hlx-callout-color)')
  })

  it('heads its text with the type\'s icon and name, small and bold', () => {
    const label = '.hlx-root .hlx-alert > .hlx-callout-label'
    expect(value(label, 'display')).toBe('flex')
    expect(value(label, 'gap')).toBe('6px')
    expect(value(label, 'font-size')).toBe('13px')
    expect(value(label, 'font-weight')).toBe('600')
    expect(value(label, 'line-height')).toBe('1.4')
    expect(value(label, 'margin-bottom')).toBe('4px')
    expect(value(label, 'font-family')).toBe('var(--hlx-font-family-sans)')
    expect(value('.hlx-root .hlx-callout-label', 'color')).toBe('var(--hlx-callout-color)')
    expect(value('.hlx-root .hlx-callout-icon svg', 'width')).toBe('15px')
    expect(value('.hlx-root .hlx-alert .hlx-callout-body > .hlx-paragraph', 'margin')).toBe('0 0 0.5em')
    expect(value('.hlx-root .hlx-callout-body > .hlx-paragraph:last-child', 'margin-bottom')).toBe('0')
  })

  it('folds its heading into the first line in the comment and chat variants', () => {
    for (const variant of ['comment', 'chat']) {
      expect(value(`.hlx-root[data-variant='${variant}'] .hlx-alert`, 'padding-left')).toBe('12px')
      expect(value(`.hlx-root[data-variant='${variant}'] .hlx-alert > .hlx-callout-label`, 'float')).toBe('left')
      expect(value(`.hlx-root[data-variant='${variant}'] .hlx-alert > .hlx-callout-label`, 'margin-bottom')).toBe('0')
    }
  })
})

describe('a banner', () => {
  it('is a tinted card with its icon beside the text', () => {
    expect(value('.hlx-root .hlx-banner', 'display')).toBe('flex')
    expect(value('.hlx-root .hlx-banner', 'gap')).toBe('12px')
    expect(value('.hlx-root .hlx-banner', 'padding')).toBe('12px 16px')
    expect(value('.hlx-root .hlx-banner', 'border-radius')).toBe('var(--hlx-radius-md)')
    expect(value('.hlx-root .hlx-banner', 'border')).toBe('none')
    expect(value('.hlx-root .hlx-banner', 'background')).toBe('color-mix(in oklab, var(--hlx-callout-color) 6%, transparent)')
    expect(value('.hlx-root .hlx-banner', 'box-shadow')).toBe('inset 0 0 0 1px color-mix(in oklab, var(--hlx-callout-color) 18%, transparent)')
    expect(value('.hlx-root .hlx-banner > .hlx-callout-label', 'height')).toBe('1lh')
    expect(value('.hlx-root .hlx-banner .hlx-callout-icon svg', 'width')).toBe('18px')
    expect(value('.hlx-root .hlx-banner > .hlx-callout-body', 'flex')).toBe('1')
  })
})
