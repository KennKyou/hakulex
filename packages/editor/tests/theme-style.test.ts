import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { readdirSync, readFileSync } from 'node:fs'
import { flushPromises, mount } from '@vue/test-utils'
import { $createNodeSelection, $getRoot, $setSelection, KEY_ENTER_COMMAND } from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { OPEN_BLOCK_DIALOG_COMMAND, RichEditor } from '../src'

/*
 * A site's colors, given as `theme`, reach the editor and everything it moves to <body>:
 * toolbars, panels, dialogs and menus each carry the editor's look on their own root.
 */

const mounted: { unmount: () => void }[] = []
afterEach(() => {
  mounted.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
})

const element = {
  format: '',
  indent: 0,
  direction: null,
  version: 1,
}
function paragraph() {
  return {
    ...element,
    type: 'paragraph',
    textFormat: 0,
    textStyle: '',
    children: [],
  }
}
const card = {
  type: 'link-card',
  version: 1,
  url: 'https://example.com/a',
  title: 'A',
}
function doc(...children: unknown[]) {
  return ({
    root: { ...element, type: 'root', children },
  }) as unknown as SerializedEditorState
}

const INK = {
  color: { accent: '#171717', text: '#0a0a0a', bg: '#fafafa' },
}

async function mountEditor(props: Record<string, unknown>) {
  const wrapper = mount(RichEditor, {
    props: {
      modelValue: doc(card, paragraph()),
      ...props,
    } as never,
    attachTo: document.body,
  })
  mounted.push(wrapper)
  await flushPromises()
  return { wrapper, editor: (wrapper.vm as unknown as { editor: LexicalEditor }).editor }
}
async function pickCard(editor: LexicalEditor) {
  editor.update(() => {
    const selection = $createNodeSelection()
    selection.add($getRoot().getFirstChildOrThrow().getKey())
    $setSelection(selection)
  }, { discrete: true })
  await flushPromises()
}
const accentOf = (element: Element | null) => (element as HTMLElement | null)?.style.getPropertyValue('--hlx-color-accent')

describe('the theme option', () => {
  it('puts the site\'s tokens on the editor and on its toolbar, panel and dialog', async () => {
    const { editor } = await mountEditor({ theme: INK })
    expect(accentOf(document.querySelector('.hlx-editor'))).toBe('#171717')
    await pickCard(editor)
    const toolbar = document.querySelector('.hlx-block-toolbar')
    expect(accentOf(toolbar)).toBe('#171717')
    expect((toolbar as HTMLElement).style.getPropertyValue('--hlx-color-text')).toBe('#0a0a0a')
    // Its place stays: the theme joins the style the toolbar already has.
    expect((toolbar as HTMLElement).style.top).not.toBe('')
    editor.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown', { key: 'Enter' }))
    await flushPromises()
    expect(accentOf(document.querySelector('.hlx-block-panel'))).toBe('#171717')

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await flushPromises()
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    editor.dispatchCommand(OPEN_BLOCK_DIALOG_COMMAND, { type: 'chat' })
    await flushPromises()
    expect(accentOf(document.querySelector('.hlx-block-dialog'))).toBe('#171717')
  })

  it('follows a change of theme at once', async () => {
    const { wrapper, editor } = await mountEditor({ theme: INK })
    await pickCard(editor)
    await wrapper.setProps({
      theme: {
        color: { accent: '#525252' },
      },
    })
    await flushPromises()
    expect(accentOf(document.querySelector('.hlx-editor'))).toBe('#525252')
    expect(accentOf(document.querySelector('.hlx-block-toolbar'))).toBe('#525252')
    await wrapper.setProps({ theme: undefined })
    await flushPromises()
    expect(accentOf(document.querySelector('.hlx-block-toolbar'))).toBe('')
  })

  it('adds no style without a theme, or with nothing it knows', async () => {
    const { editor } = await mountEditor({
      theme: {
        color: { nope: '#000', accent: 3 },
      },
    })
    expect(document.querySelector<HTMLElement>('.hlx-editor')!.getAttribute('style') ?? '').not.toContain('--hlx')
    await pickCard(editor)
    expect(document.querySelector<HTMLElement>('.hlx-block-toolbar')!.getAttribute('style')).not.toContain('--hlx')
  })
})

describe('everything moved to <body>', () => {
  // Every root that copies the editor's color scheme must copy the site's tokens with it.
  const sources = [
    ...readdirSync(`${process.cwd()}/packages/editor/src/components`).filter(name => name.endsWith('.vue')).map(name => `packages/editor/src/components/${name}`),
    ...[
      'block-handle',
      'floating-toolbar',
      'mention',
      'slash-menu',
      'table',
      'toolbar',
    ].flatMap(plugin => readdirSync(`${process.cwd()}/packages/plugin-${plugin}/src`)
      .filter(name => name.endsWith('.vue'))
      .map(name => `packages/plugin-${plugin}/src/${name}`)),
  ]

  it.each(sources.filter(path => readFileSync(`${process.cwd()}/${path}`, 'utf8').includes(':data-color-scheme="theme.colorScheme"')))('%s carries the theme style wherever it carries the scheme', (path) => {
    const source = readFileSync(`${process.cwd()}/${path}`, 'utf8')
    const tags = [
      ...source.matchAll(/<[\w-]+\s[^>]*:data-color-scheme="theme\.colorScheme"[^>]*>/g),
    ].map(([tag]) => tag)
    expect(tags.length).toBeGreaterThan(0)
    for (const tag of tags)
      expect(tag, tag).toMatch(/:style="[^"]*theme\.style/)
  })
})
