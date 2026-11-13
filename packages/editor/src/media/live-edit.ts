import type { LexicalEditor, LexicalNode, NodeKey } from 'lexical'
import type { ComputedRef, FunctionalComponent, Ref, ShallowRef } from 'vue'
import type { BlockToolbarAction } from '../components/BlockToolbar.vue'
import { useLexicalComposer } from '@hakulex/vue-lexical'
import { $addUpdateTag, $getNodeByKey, HISTORY_MERGE_TAG, HISTORY_PUSH_TAG, UNDO_COMMAND } from 'lexical'
import { computed, h, onBeforeUnmount, shallowRef, watch } from 'vue'
import { $selectNode } from './block-navigation'
import { useBlockFloating, useOutsidePress } from './floating'

/*
 * A block edited in a panel beside it: each change goes into the document as it is made, and
 * Esc puts the block back as it was when the panel opened.
 */

/** What a panel edits on its node: read as one value, written back whole. */
export interface LiveFields<T> {
  $read: (node: LexicalNode | null) => T | null
  $write: (node: LexicalNode, value: T) => void
}

const panels = new WeakMap<LexicalEditor, ShallowRef<NodeKey | null>>()
/** Which block has its panel open, one per editor: the plugins open it, the block shows it. */
export function blockPanelOf(editor: LexicalEditor): ShallowRef<NodeKey | null> {
  let state = panels.get(editor)
  if (!state) {
    state = shallowRef<NodeKey | null>(null)
    panels.set(editor, state)
  }
  return state
}

export interface LiveEdit<T> {
  /** Writes `next`, if it differs. Typing on in the same `field` joins the step before. */
  write: (next: T, field?: string) => void
  /** The field was left: whatever comes next is a step of its own. */
  endTyping: () => void
  /** Back to how the node was when this began, leaving none of these steps to undo. */
  revert: () => void
}

/** The writes of one panel, from when it opens until it closes. */
export function createLiveEdit<T>(editor: LexicalEditor, nodeKey: NodeKey, { $read, $write }: LiveFields<T>): LiveEdit<T> {
  const current = () => editor.getEditorState().read(() => $read($getNodeByKey(nodeKey)))
  const start = current()
  const started = JSON.stringify(start)
  let steps = 0
  let typing: string | null = null

  function put(value: T, join: boolean) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (!node || $read(node) === null)
        return
      $addUpdateTag(join ? HISTORY_MERGE_TAG : HISTORY_PUSH_TAG)
      $write(node, value)
    }, { discrete: true })
  }

  return {
    write(next, field) {
      if (JSON.stringify(current()) !== JSON.stringify(next)) {
        const join = field !== undefined && field === typing && steps > 0
        put(next, join)
        if (!join)
          steps++
      }
      typing = field ?? null
    },
    endTyping() {
      typing = null
    },
    revert() {
      // While the panel is open nothing else changes the block, so its own steps undo it…
      for (; steps > 0; steps--)
        editor.dispatchCommand(UNDO_COMMAND, undefined)
      typing = null
      // …unless they are gone, or something else got in between: then write the old value back.
      if (start !== null && JSON.stringify(current()) !== started)
        put(start, false)
    },
  }
}

/** A pencil, for the 編輯 on a block's toolbar. */
export const IconEdit: FunctionalComponent = () => h('svg', {
  'viewBox': '0 0 16 16',
  'width': 14,
  'height': 14,
  'fill': 'none',
  'stroke': 'currentColor',
  'stroke-width': 1.4,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'aria-hidden': 'true',
  'focusable': 'false',
}, [
  h('path', { d: 'M10.5 3.5l2 2L6 12H4v-2z' }),
])

export interface HasElement { element: HTMLElement | null }

/**
 * A block edited in a panel: its toolbar, whose 編輯 opens and closes the panel; a double
 * click that opens it; and the panel's place, writes and closing. `element` is the block's.
 * `parts` are the template refs of its toolbar and panel, which a press inside doesn't close.
 */
export function useBlockPanel<T>(
  nodeKey: NodeKey,
  element: Ref<HTMLElement | null>,
  selected: Ref<boolean>,
  editable: Ref<boolean>,
  fields: LiveFields<T>,
  parts: {
    toolbar: Readonly<Ref<HasElement | null>>
    panel: Readonly<Ref<HasElement | null>>
    /** The site's own dialog is over the panel: a press there doesn't close it. */
    away?: Readonly<Ref<boolean>>
  },
  width = 320,
): {
  open: ComputedRef<boolean>
  showToolbar: ComputedRef<boolean>
  toolbarStyle: ComputedRef<Record<string, string>>
  panelStyle: ComputedRef<Record<string, string>>
  editAction: ComputedRef<BlockToolbarAction>
  openPanel: () => void
  close: (how: 'keep' | 'revert', focus?: boolean) => void
  onDblclick: (event: MouseEvent) => void
  write: (next: T, field?: string) => void
  endTyping: () => void
} {
  const editor = useLexicalComposer()
  const panels = blockPanelOf(editor)
  const open = computed(() => editable.value && panels.value === nodeKey)
  const showToolbar = computed(() => editable.value && (selected.value || open.value))
  const { toolbarStyle, panelStyle } = useBlockFloating(editor, element, showToolbar)
  const { toolbar, panel, away } = parts

  let session: LiveEdit<T> | null = null
  watch(open, (now) => {
    session = now
      ? createLiveEdit(editor, nodeKey, fields)
      : null
  }, { immediate: true })

  function openPanel() {
    if (!editable.value)
      return
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node)
        $selectNode(node)
    })
    panels.value = nodeKey
  }

  /** Puts the panel away; with `focus`, the block is left picked with the keyboard in the editor. */
  function close(how: 'keep' | 'revert', focus = true) {
    if (how === 'revert')
      session?.revert()
    session = null
    if (panels.value === nodeKey)
      panels.value = null
    if (!focus)
      return
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node)
        $selectNode(node)
    })
    editor.getRootElement()?.focus({ preventScroll: true })
  }

  // A press anywhere but the panel, the toolbar or the block keeps what was written and closes.
  useOutsidePress(() => [element.value, toolbar.value?.element, panel.value?.element], open, () => {
    if (!away?.value)
      close('keep', false)
  })
  // Read-only: what was written stays, the panel goes.
  watch(editable, (now) => {
    if (!now && panels.value === nodeKey) {
      session = null
      panels.value = null
    }
  })
  onBeforeUnmount(() => {
    if (panels.value === nodeKey)
      panels.value = null
  })

  return {
    open,
    showToolbar,
    toolbarStyle,
    panelStyle: panelStyle(width),
    editAction: computed(() => ({
      id: 'edit',
      label: '編輯',
      icon: IconEdit,
      expanded: open.value,
      onSelect: () => (open.value
        ? close('keep')
        : openPanel()),
    })),
    openPanel,
    close,
    onDblclick(event) {
      // Tabs, links and buttons are for what they say.
      if (!editable.value || (event.target as Element).closest('button, a, input'))
        return
      event.preventDefault()
      openPanel()
    },
    write: (next, field) => session?.write(next, field),
    endTyping: () => session?.endTyping(),
  }
}
