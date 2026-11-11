import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * While editing, each heading is marked with its level on the left
 * (rich-editor/src/styles/shared.css.ts: headingLevelBadge and hideBadgeWhenNarrow).
 */

const EDITOR = readFileSync(`${process.cwd()}/packages/editor/src/styles/editor.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** Flat rules, each with the at-rule it sits in (if any) in front of its selector. */
function rules(css: string) {
  const found: { selector: string, media: string, declarations: Map<string, string> }[] = []
  let media = ''
  let depth = 0
  for (const match of css.matchAll(/([^{}]*)([{}])/g)) {
    const [, head, brace] = match
    if (brace === '}') {
      depth = Math.max(0, depth - 1)
      if (depth === 0)
        media = ''
      continue
    }
    const selector = head.trim().replace(/\s+/g, ' ')
    if (selector.startsWith('@')) {
      media = selector
      depth++
      continue
    }
    depth++
    const body = css.slice(match.index! + match[0].length, css.indexOf('}', match.index! + match[0].length))
    found.push({
      selector,
      media,
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
const all = rules(EDITOR)
const selectors = (list: string) => list.split(/,(?![^(]*\))\s*/).map(item => item.trim())
function value(selector: string, name: string, media = '') {
  let found: string | undefined
  for (const rule of all) {
    if (rule.media === media && selectors(rule.selector).includes(selector) && rule.declarations.has(name))
      found = rule.declarations.get(name)
  }
  return found
}

const LEVELS = [1, 2, 3, 4, 5, 6]
const badge = (level: number) => `.hlx-editor [contenteditable='true'] .hlx-h${level}::before`

describe('heading level badges', () => {
  it('name each level, only where the content can be edited', () => {
    for (const level of LEVELS)
      expect(value(badge(level), 'content')).toBe(`'H${level}'`)
  })

  it('sit 24px to the left, small, mono and faint', () => {
    const box = badge(1)
    expect(value(box, 'position')).toBe('absolute')
    expect(value(box, 'left')).toBe('-1.5rem')
    expect(value(box, 'bottom')).toBe('0.5rem')
    expect(value(box, 'display')).toBe('flex')
    expect(value(box, 'font-size')).toBe('0.5rem')
    expect(value(box, 'font-weight')).toBe('600')
    expect(value(box, 'font-family')).toBe('var(--hlx-font-mono)')
    expect(value(box, 'color')).toBe('var(--hlx-color-text-secondary)')
    expect(value(box, 'opacity')).toBe('0.6')
    // Not something to click or select, and the same for every level.
    expect(value(box, 'pointer-events')).toBe('none')
    expect(value(box, 'user-select')).toBe('none')
    for (const level of LEVELS)
      expect(value(badge(level), 'font-size')).toBe('0.5rem')
    expect(value('.hlx-editor [contenteditable=\'true\'] .hlx-h6', 'position')).toBe('relative')
  })

  it('give way to the block handle beside them, leaving other blocks\' own marks alone', () => {
    for (const level of LEVELS)
      expect(value(`.hlx-editor [contenteditable='true'] .hlx-h${level}[data-hlx-handle]::before`, 'opacity')).toBe('0')
    // A quote's bar or a checkbox is also a ::before: those stay.
    expect(all.filter(rule => rule.selector.includes('[data-hlx-handle]') && !/\.hlx-h\d\[data-hlx-handle\]/.test(rule.selector))).toEqual([])
  })

  it('are not shown on narrow screens', () => {
    for (const level of LEVELS)
      expect(value(badge(level), 'display', '@media (max-width: 640px)')).toBe('none')
  })

  it('are not part of what is read: no badge outside the editable content', () => {
    expect(all.filter(rule => /\.hlx-h\d::before/.test(rule.selector) && !rule.selector.includes('[contenteditable=\'true\']'))).toEqual([])
  })
})
