import type { LexicalEditor, SerializedEditorState } from 'lexical'
import type { HasElement } from '../src/media/live-edit'
import { useLexicalComposer, useLexicalEditable, useLexicalNodeSelection } from '@hakulex/vue-lexical'
import { flushPromises, mount } from '@vue/test-utils'
import { $addUpdateTag, $getNodeByKey, $getRoot, $getSelection, $isNodeSelection, CLEAR_HISTORY_COMMAND, HISTORY_PUSH_TAG, UNDO_COMMAND } from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, onMounted, shallowRef, useTemplateRef } from 'vue'
import { RichEditor } from '../src'
import BlockPanel from '../src/components/BlockPanel.vue'
import BlockToolbar from '../src/components/BlockToolbar.vue'
import { blockPanelOf, useBlockPanel } from '../src/media/live-edit'
import { $isChatNode } from '../src/nodes/ChatNode'

/*
 * The shared panel, on a block of its own: a chat, edited in a dialog, stands in, with a panel of two text
 * fields, so what is checked here is the panel and its writes, not any block's form.
 */

type Json = Record<string, any>
const mounted: { unmount: () => void }[] = []
afterEach(() => {
  mounted.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
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
// A chat keeps fields it doesn't know, so it holds these two as they are.
const card = {
  type: 'chat',
  version: 1,
  messages: [
    { role: 'user', content: '嗨' },
  ],
  title: 'A',
  description: 'D',
}

interface Text { title: string, description: string }
let api!: ReturnType<typeof useBlockPanel<Text>>
let key = ''

const Harness = defineComponent({
  setup() {
    const editor = useLexicalComposer()
    const editable = useLexicalEditable()
    const { isSelected } = useLexicalNodeSelection(key)
    const block = shallowRef<HTMLElement | null>(null)
    onMounted(() => {
      block.value = editor.getElementByKey(key)
      // Ahead of the chat's own handler, which opens its dialog.
      block.value?.addEventListener('dblclick', (event) => {
        event.stopPropagation()
        api.onDblclick(event)
      }, true)
    })
    const parts = {
      toolbar: useTemplateRef<HasElement>('blockToolbar'),
      panel: useTemplateRef<HasElement>('blockPanel'),
    }
    api = useBlockPanel<Text>(key, block, computed(() => editable.value && isSelected.value), editable, {
      $read: node => ($isChatNode(node)
        ? {
            title: String(node.getFields().title ?? ''),
            description: String(node.getFields().description ?? ''),
          }
        : null),
      $write: (node, value) => {
        (node as any).setFields(value)
      },
    }, parts)
    const now = () => editor.getEditorState().read(() => {
      const node = $getNodeByKey(key)
      return $isChatNode(node)
        ? node.getFields() as Json
        : {}
    })
    const field = (name: keyof Text) => h('input', {
      'type': 'text',
      'data-field': name,
      'value': now()[name],
      'onInput': (event: Event) => api.write({
        title: now().title,
        description: now().description,
        [name]: (event.target as HTMLInputElement).value,
      } as Text, name),
      'onFocusout': () => api.endTyping(),
    })
    return () => [
      api.showToolbar.value
        ? h(BlockToolbar, {
            ref: 'blockToolbar',
            label: '測試',
            actions: [api.editAction.value],
            style: api.toolbarStyle.value,
          })
        : null,
      api.open.value
        ? h(BlockPanel, {
            ref: 'blockPanel',
            title: '測試',
            style: api.panelStyle.value,
            onClose: () => api.close('keep'),
            onRevert: () => api.close('revert'),
          }, () => [
            field('title'),
            field('description'),
          ])
        : null,
    ]
  },
})

let active: LexicalEditor
async function mountCard() {
  const ready = shallowRef(false)
  const wrapper = mount(RichEditor, {
    props: {
      modelValue: {
        root: {
          ...element,
          type: 'root',
          children: [
            paragraph(),
            card,
            paragraph(),
          ],
        },
      } as unknown as SerializedEditorState,
    } as never,
    slots: {
      default: () => (ready.value
        ? h(Harness)
        : null),
    },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  await flushPromises()
  active = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  key = active.getEditorState().read(() => $getRoot().getChildren().find($isChatNode)!.getKey())
  ready.value = true
  await flushPromises()
  return active
}
const fields = () => active.getEditorState().read(() => ($getNodeByKey(key) as any).getFields() as Json)
const panel = () => document.querySelector<HTMLElement>('.hlx-block-panel')
const input = (name: string) => panel()!.querySelector<HTMLInputElement>(`[data-field="${name}"]`)!
const toolbarButton = () => document.querySelector<HTMLElement>('[role="toolbar"][aria-label="測試"] button')!
async function type(name: string, value: string) {
  const target = input(name)
  target.focus()
  target.value = value
  target.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}
async function openPanel() {
  blockPanelOf(active).value = key
  await flushPromises()
}
async function undo() {
  active.dispatchCommand(UNDO_COMMAND, undefined)
  await flushPromises()
}
async function keyOn(target: Element, name: string) {
  // Vue drops an event stamped in the same millisecond its listener was attached; a person is never that quick.
  await new Promise(resolve => setTimeout(resolve, 5))
  target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }))
  await flushPromises()
}
function picked() {
  return active.getEditorState().read(() => {
    const selection = $getSelection()
    return $isNodeSelection(selection) && selection.has(key)
  })
}

describe('the panel beside a block', () => {
  it('opens over the page by the block, named, with the first field focused and a hint at its foot', async () => {
    await mountCard()
    await openPanel()
    const shown = panel()!
    expect(shown.parentElement).toBe(document.body)
    expect(shown.getAttribute('role')).toBe('dialog')
    expect(shown.getAttribute('aria-label')).toBe('測試')
    // The chart's panel look, shared.
    expect(shown.classList.contains('hlx-root')).toBe(true)
    expect(shown.classList.contains('hlx-chart-popover')).toBe(true)
    expect(shown.querySelector('.hlx-chart-panel-head')!.textContent).toContain('測試')
    expect(shown.querySelector('.hlx-block-panel-foot')!.textContent!.trim()).toBe('改了就會套用 · Esc 還原')
    expect(shown.style.width).toBe('320px')
    expect(shown.style.top).not.toBe('')
    expect(document.activeElement).toBe(input('title'))
    // The toolbar stays while it is open, and says so.
    expect(toolbarButton().getAttribute('aria-expanded')).toBe('true')
  })

  it('opens from the toolbar\'s 編輯 and a double click, and only one at a time per editor', async () => {
    await mountCard()
    blockPanelOf(active).value = null
    active.getElementByKey(key)!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(panel()).not.toBeNull()
    expect(blockPanelOf(active).value).toBe(key)
    toolbarButton().click()
    await flushPromises()
    expect(panel()).toBeNull()
    toolbarButton().click()
    await flushPromises()
    expect(panel()).not.toBeNull()
  })

  it('writes each change as it is made: typing in one field is one step, another field another', async () => {
    await mountCard()
    await openPanel()
    await type('title', 'B')
    await type('title', 'Bo')
    await type('title', 'Bob')
    expect(fields().title).toBe('Bob')
    input('title').dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    await type('description', 'E')
    expect(fields().description).toBe('E')
    // Out of the panel, then back two steps.
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(panel()).toBeNull()
    await undo()
    expect(fields()).toMatchObject({ title: 'Bob', description: 'D' })
    await undo()
    expect(fields()).toMatchObject({ title: 'A', description: 'D' })
  })

  it('writes nothing for a value that is already there', async () => {
    await mountCard()
    await openPanel()
    await type('title', 'A')
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await flushPromises()
    active.update(() => {
      $addUpdateTag(HISTORY_PUSH_TAG)
      ;($getNodeByKey(key) as any).setFields({ title: 'Z' })
    }, { discrete: true })
    await undo()
    // Only the change made here comes off: the panel left no step of its own.
    expect(fields().title).toBe('A')
    await undo()
    expect(fields().title).toBe('A')
  })

  it('puts the block back as it was on Esc, with nothing of the panel left to undo', async () => {
    await mountCard()
    await openPanel()
    await type('title', 'B')
    input('title').dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    await type('description', 'E')
    await keyOn(input('description'), 'Escape')
    expect(panel()).toBeNull()
    expect(fields()).toMatchObject({ title: 'A', description: 'D' })
    await undo()
    expect(fields()).toMatchObject({ title: 'A', description: 'D' })
    // Still picked, with the keyboard back in the editor.
    expect(picked()).toBe(true)
    expect(document.activeElement).toBe(active.getRootElement())
  })

  it('still puts the block back on Esc when the steps it made can no longer be undone', async () => {
    await mountCard()
    await openPanel()
    await type('title', 'B')
    active.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined)
    await flushPromises()
    await keyOn(input('title'), 'Escape')
    expect(fields()).toMatchObject({ title: 'A', description: 'D' })
  })

  it('keeps the changes when closed from outside or the toolbar, with the block still picked', async () => {
    await mountCard()
    await openPanel()
    await type('title', 'B')
    toolbarButton().click()
    await flushPromises()
    expect(panel()).toBeNull()
    expect(fields().title).toBe('B')
    expect(picked()).toBe(true)
    expect(document.activeElement).toBe(active.getRootElement())
  })

  it('closes when the editor turns read-only, keeping what was written, and does not open there', async () => {
    await mountCard()
    await openPanel()
    await type('title', 'B')
    active.setEditable(false)
    await flushPromises()
    expect(panel()).toBeNull()
    expect(blockPanelOf(active).value).toBeNull()
    expect(fields().title).toBe('B')
    active.getElementByKey(key)!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(panel()).toBeNull()
  })
})
