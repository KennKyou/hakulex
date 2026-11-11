import type { LexicalEditor } from 'lexical'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  document.body.innerHTML = ''
  vi.resetModules()
})

// A dialog that imports its node pulls in the node's component and the plugin that lists the
// dialogs before the dialog itself is defined. Whichever module an app loads first, every
// dialog must still open.
const dialogs = {
  'code-snippet': () => import('../src/components/CodeSnippetDialog.vue'),
  'gallery': () => import('../src/components/GalleryDialog.vue'),
  'chat': () => import('../src/components/ChatDialog.vue'),
  'link-card': () => import('../src/components/LinkCardDialog.vue'),
} as const

describe('loading a dialog before the editor', () => {
  it.each(Object.keys(dialogs) as (keyof typeof dialogs)[])('still opens the %s dialog', async (type) => {
    vi.resetModules()
    await dialogs[type]()
    const { OPEN_BLOCK_DIALOG_COMMAND, RichEditor } = await import('../src')
    const wrapper = mount(RichEditor, { attachTo: document.body })
    await flushPromises()
    const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
    editor.dispatchCommand(OPEN_BLOCK_DIALOG_COMMAND, { type })
    await flushPromises()
    expect(document.querySelector('.hlx-block-dialog')).not.toBeNull()
    wrapper.unmount()
  })
})

describe('loading the chart panel before the editor', () => {
  it('still inserts a chart and opens its panel', async () => {
    vi.resetModules()
    await import('../src/components/ChartPanel.vue')
    const { OPEN_BLOCK_DIALOG_COMMAND, RichEditor } = await import('../src')
    const wrapper = mount(RichEditor, { attachTo: document.body })
    await flushPromises()
    const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
    editor.dispatchCommand(OPEN_BLOCK_DIALOG_COMMAND, { type: 'chart' })
    await flushPromises()
    expect(document.querySelector('.hlx-chart-panel')).not.toBeNull()
    wrapper.unmount()
  })
})

describe('loading the poll panel before the editor', () => {
  it('still inserts a poll and opens its panel', async () => {
    vi.resetModules()
    await import('../src/components/PollPanel.vue')
    const { OPEN_BLOCK_DIALOG_COMMAND, RichEditor } = await import('../src')
    const wrapper = mount(RichEditor, { attachTo: document.body })
    await flushPromises()
    const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
    editor.dispatchCommand(OPEN_BLOCK_DIALOG_COMMAND, { type: 'poll' })
    await flushPromises()
    expect(document.querySelector('.hlx-block-panel[aria-label="投票"]')).not.toBeNull()
    wrapper.unmount()
  })
})
