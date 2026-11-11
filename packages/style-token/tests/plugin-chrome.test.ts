import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const PLUGINS = [
  'plugin-slash-menu',
  'plugin-mention',
  'plugin-block-handle',
  'plugin-table',
  'plugin-floating-toolbar',
  'plugin-toolbar',
]

/** Every rule in a plugin's styles, comments gone. */
function rules(plugin: string) {
  const css = readFileSync(`${process.cwd()}/packages/${plugin}/src/styles.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  return [
    ...css.matchAll(/([^{}]+)\{([^{}]*)\}/g),
  ].map(([, selector, body]) => ({
    selector: selector.trim().replace(/\s+/g, ' '),
    declarations: new Map([
      ...body.matchAll(/([\w-]+):([^;]+);/g),
    ].map(([, name, value]) => [
      name.trim(),
      value.trim(),
    ])),
  }))
}
const all = PLUGINS.flatMap(plugin => rules(plugin).map(rule => ({ plugin, ...rule })))

// A drop line is a line, not a surface.
const EXCEPT = new Set(['.hlx-block-drop-line'])
const tokenOnly = (value: string) => /var\(--hlx-chrome-[\w-]+\)/.test(value) || /^(?:0|none|50%|inherit)$/.test(value)

const POPUPS = [
  '.hlx-slash-menu',
  '.hlx-mention-menu',
  '.hlx-block-menu',
  '.hlx-table-menu',
  '.hlx-floating-toolbar',
  '.hlx-fixed-toolbar-menu',
]
const ITEMS = [
  '.hlx-slash-item',
  '.hlx-mention-item',
  '.hlx-block-menu-item',
  '.hlx-table-menu-item',
  '.hlx-fixed-toolbar-menu-item',
]

describe('the plugins\' menus and toolbars', () => {
  it('take corners and shadows only from the chrome tokens', () => {
    const wrong = all.flatMap(({ plugin, selector, declarations }) => EXCEPT.has(selector)
      ? []
      : ['border-radius', 'box-shadow'].flatMap((name) => {
          const value = declarations.get(name)
          return value !== undefined && !tokenOnly(value)
            ? [`${plugin}: ${selector} { ${name}: ${value} }`]
            : []
        }))
    expect(wrong).toEqual([])
  })

  it('draw every popup the same: large corners, the popup shadow, no border of its own', () => {
    for (const name of POPUPS) {
      const rule = all.find(({ selector }) => selector === name)!
      expect(rule, name).toBeDefined()
      expect(rule.declarations.get('border-radius'), name).toBe('var(--hlx-chrome-radius-lg)')
      expect(rule.declarations.get('box-shadow'), name).toBe('var(--hlx-chrome-shadow-popup)')
      expect(rule.declarations.get('border') ?? '0', name).toBe('0')
    }
  })

  it('leave dark mode to the tokens', () => {
    const dark = all.filter(({ selector, declarations }) => selector.includes(`[data-color-scheme='dark']`) && declarations.has('box-shadow'))
    expect(dark.map(({ selector }) => selector)).toEqual([])
  })

  it('round every menu item alike', () => {
    for (const name of ITEMS) {
      const rule = all.find(({ selector }) => selector === name)!
      expect(rule.declarations.get('border-radius'), name).toBe('var(--hlx-chrome-radius-item)')
    }
  })
})
