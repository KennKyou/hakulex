import { readFileSync } from 'node:fs'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import BlockDialog from '../src/components/BlockDialog.vue'
import ImageDialog from '../src/components/ImageDialog.vue'
import MediaDialog from '../src/components/MediaDialog.vue'
import MermaidDialog from '../src/components/MermaidDialog.vue'

const mounted: { unmount: () => void }[] = []
afterEach(() => {
  mounted.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
})

/** Every rule in the editor's styles, comments gone, as selector and declarations. */
function rules() {
  const css = readFileSync(`${process.cwd()}/packages/editor/src/styles/editor.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
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

describe('dialogs', () => {
  async function shown(component: unknown, props: Record<string, unknown>) {
    const wrapper = mount(component as never, { props: props as never, attachTo: document.body })
    mounted.push(wrapper)
    await flushPromises()
    return document.querySelector<HTMLElement>('[role="dialog"]')!
  }

  it.each([
    [
      'a block dialog',
      BlockDialog,
      { title: '編輯圖庫', description: 'd' },
      '編輯圖庫',
    ],
    [
      'the image dialog',
      ImageDialog,
      // On its list, where the foot has the insert button.
      {
        initialFiles: [
          new File(['x'], 'a.png', { type: 'image/png' }),
        ],
        canUpload: true,
      },
      '插入圖片',
    ],
    [
      'the media dialog',
      MediaDialog,
      { open: true, kind: 'video' },
      '',
    ],
    [
      'the Mermaid dialog',
      MermaidDialog,
      { open: true, source: '' },
      '',
    ],
  ] as const)('%s has the shared frame: a head with the title, and a foot with the actions', async (_, component, props, title) => {
    const dialog = await shown(component, props)
    expect(dialog.classList.contains('hlx-dialog')).toBe(true)
    const head = dialog.querySelector('.hlx-dialog-head')!
    expect(head.querySelector('h2, [id]')!.textContent).toContain(title)
    const foot = dialog.querySelector('.hlx-dialog-foot')!
    expect(foot.querySelector('button[data-primary]')).not.toBeNull()
  })
})

/*
 * The editor's interface, as opposed to the content: dialogs, panels, menus, toolbars and
 * the controls in them. Their corners and shadows come from the chrome tokens.
 */
const CHROME = /\.hlx-(?:dialog|block-dialog|image-dialog|image-field|image-actions|mermaid-dialog|mermaid-chip|mermaid-source|snippet-dialog|gallery-(?:row|upload)|chat-edit|poll-|link-card-dialog|math-popover|math-input|math-button|callout-bar|quote-bar|grid-toolbar|lang-|block-toolbar|block-empty > button|media-pick|image-upload|media-upload|mention-panel|mention-field|mention-actions|embed-input|embed-button|step-actions|footnote-input|footnote-remove|chart-(?:toolbar|popover|tabs|segmented|panel|raw|form|wide-button|icon-button|head-button|data|swatch-button|swatch-choice|category-mark))/
// Not chrome though it matches: a swatch's color chip is a picture of a chart color.
const EXCEPT = new Set([
  '.hlx-chart-swatch-button > .hlx-chart-swatch',
])
const tokenOnly = (value: string) => /var\(--hlx-chrome-[\w-]+\)/.test(value) || /^(?:0|none|50%|inherit)$/.test(value)

/** Every declaration given to a selector, alone or in a list, later rules over earlier ones. */
function merged(target: string) {
  const found = new Map<string, string>()
  for (const { selector, declarations } of rules()) {
    if (selector.split(',').map(part => part.trim()).includes(target))
      declarations.forEach((value, name) => found.set(name, value))
  }
  return found
}

describe('the editor\'s chrome styles', () => {
  it('take corners and shadows only from the chrome tokens', () => {
    const wrong: string[] = []
    for (const { selector, declarations } of rules()) {
      if (!CHROME.test(selector) || EXCEPT.has(selector))
        continue
      for (const name of ['border-radius', 'box-shadow']) {
        const value = declarations.get(name)
        if (value !== undefined && !tokenOnly(value))
          wrong.push(`${selector} { ${name}: ${value} }`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('no longer keep the chart panel\'s own copies of the tokens', () => {
    expect(rules().some(({ declarations }) => [
      ...declarations.keys(),
    ].some(name => name.startsWith('--hlx-chart-ui-')))).toBe(false)
  })

  it('draw every block\'s toolbar the same', () => {
    const surface = merged('.hlx-block-toolbar')
    expect(surface.get('border-radius')).toBe('var(--hlx-chrome-radius-lg)')
    expect(surface.get('box-shadow')).toBe('var(--hlx-chrome-shadow-popup)')
    expect(merged('.hlx-block-toolbar > button').get('height')).toBe('var(--hlx-chrome-height-md)')
    // The chart's toolbar is the shared one: nothing of its own to tell it apart.
    expect(rules().filter(({ selector }) => /\.hlx-chart-toolbar(?![\w-])/.test(selector))).toEqual([])
  })

  it('have no styles left for the edit buttons the toolbar took the place of', () => {
    expect(rules().filter(({ selector }) => /\.hlx-(?:block-edit--floating|snippet-edit|image-edit|media-edit)(?![\w-])/.test(selector)).map(({ selector }) => selector)).toEqual([])
  })

  it('keep the button that picks a video quiet until pointed at', () => {
    const pick = merged('.hlx-editor .hlx-media-pick')
    expect(pick.get('position')).toBe('absolute')
    expect(pick.get('box-shadow')).toBe('var(--hlx-chrome-shadow-popup)')
    expect(rules().some(({ selector, declarations }) => selector.includes('.hlx-media-pick') && declarations.get('opacity') === '0')).toBe(true)
  })

  it('are all whole rules: no selector cut short, which would drop every rule after it', () => {
    const broken = rules().filter(({ selector }) => selector.split('(').length !== selector.split(')').length)
    expect(broken.map(({ selector }) => selector)).toEqual([])
  })

  it('outline a picked block the same way, except inline ones', () => {
    for (const { selector, declarations } of rules()) {
      const offset = declarations.get('outline-offset')
      if (!selector.includes('[data-selected]') || offset === undefined)
        continue
      if (/math-editor|mention-editor/.test(selector))
        expect(offset, selector).toBe('1px')
      else
        expect(offset, selector).toBe('2px')
    }
  })
})

describe('written-in colors in the interface', () => {
  const COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(|\b(?:white|black|red|green|blue|yellow|orange|gray|grey)\b/i
  const FILES = [
    'packages/editor/src/styles/editor.css',
    ...[
      'block-handle',
      'floating-toolbar',
      'link-edit',
      'mention',
      'slash-menu',
      'table',
      'toolbar',
    ].map(plugin => `packages/plugin-${plugin}/src/styles.css`),
  ]
  /** Where a fixed color is the point. */
  const fixed = (selector: string, name: string, value: string) =>
    /^(?:-webkit-)?mask-image$/.test(name) // a mask's black is how opaque it is
    || (selector.endsWith('-error') && name === 'color' && value === '#fff') // white text on a caution fill

  it.each(FILES)('%s takes its colors from the tokens', (path) => {
    const css = readFileSync(`${process.cwd()}/${path}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const found: string[] = []
    for (const [, rawSelector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = rawSelector.trim().replace(/\s+/g, ' ')
      for (const [, rawName, rawValue] of body.matchAll(/([\w-]+)\s*:([^;]+);/g)) {
        const [name, value] = [
          rawName.trim(),
          rawValue.trim(),
        ]
        if (COLOR.test(value) && !fixed(selector, name, value) && !(/^color-mix\(/.test(value) && !/#[0-9a-f]{3,8}\b/i.test(value)))
          found.push(`${selector} { ${name}: ${value} }`)
      }
    }
    expect(found).toEqual([])
  })
})
