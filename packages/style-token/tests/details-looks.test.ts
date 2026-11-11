import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * A collapsible block looks: no
 * box, an arrow before the summary and a line after it, a guide beside what opens, eased in.
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
/** The first rule's value: later ones sit in at-rules, such as reduced motion. */
function value(selector: string, name: string) {
  return rules.find(rule => selectors(rule.selector).includes(selector) && rule.declarations.has(name))?.declarations.get(name)
}
const DETAILS = '.hlx-root .hlx-details'

describe('a collapsible block', () => {
  it('has no box, only the space around it', () => {
    expect(value(DETAILS, 'margin')).toBe('var(--hlx-space-md) 0')
    expect(value(DETAILS, 'border')).toBe('none')
    expect(value(DETAILS, 'background')).toBe('transparent')
  })

  it('eases two registered numbers from closed to open', () => {
    for (const name of ['--hlx-details-progress', '--hlx-details-content-progress'])
      expect(CSS).toMatch(new RegExp(`@property ${name}\\s*\\{\\s*syntax: '<number>';\\s*inherits: true;\\s*initial-value: 0;\\s*\\}`))
    expect(value(DETAILS, '--hlx-details-progress')).toBe('0')
    expect(value(`${DETAILS}[open]`, '--hlx-details-progress')).toBe('1')
    expect(value(`${DETAILS}[open]`, '--hlx-details-content-progress')).toBe('1')
    expect(value(DETAILS, 'transition')).toBe('--hlx-details-progress 640ms linear, --hlx-details-content-progress 370ms cubic-bezier(0.4, 0, 0.2, 1)')
    expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.hlx-root \.hlx-details\s*\{\s*transition: none;/)
  })

  it('lines its summary up with an arrow before it and a line after it that draws back as it opens', () => {
    const summary = '.hlx-root .hlx-details-summary'
    expect(value(summary, 'display')).toBe('flex')
    expect(value(summary, 'gap')).toBe('var(--hlx-space-sm)')
    expect(value(summary, 'padding')).toBe('0.75em 0')
    expect(value(summary, 'font-weight')).toBe('500')
    expect(value(summary, 'list-style')).toBe('none')
    expect(value(`${summary}::after`, 'flex')).toBe('1 1 2.5rem')
    expect(value(`${summary}::after`, 'height')).toBe('1px')
    expect(value(`${summary}::after`, 'background')).toBe('var(--hlx-color-border)')
    expect(value(`${summary}::after`, 'transform')).toBe('scaleX(calc(1 - var(--hlx-details-line)))')
    expect(value('.hlx-root .hlx-details-chevron', 'width')).toBe('1.25rem')
    expect(value('.hlx-root .hlx-details-chevron', 'color')).toBe('var(--hlx-color-text-tertiary)')
    expect(value('.hlx-root .hlx-details-chevron', 'transform')).toBe('rotate(calc(var(--hlx-details-content-progress) * 90deg))')
  })

  it('opens its content beside a guide line, in the second text color', () => {
    const body = '.hlx-root .hlx-details-body'
    expect(value(body, 'color')).toBe('var(--hlx-color-text-secondary)')
    expect(value(body, 'padding')).toBe('calc(0.875em * var(--hlx-details-content-progress)) 0 calc(1.25em * var(--hlx-details-content-progress)) calc(1.25rem + var(--hlx-space-sm))')
    expect(value(`${body}::before`, 'width')).toBe('1px')
    expect(value(`${body}::before`, 'background')).toBe('var(--hlx-color-border)')
    expect(value(`${body}::before`, 'transform')).toBe('scaleY(var(--hlx-details-guide))')
  })
})
