<script setup lang="ts">
import type { MathNode } from '../nodes/MathNodes'
import { MathView } from '@hakulex/renderer'
import { useLexicalComposer, useLexicalEditable, useLexicalNodeSelection } from '@hakulex/vue-lexical'
import { $createParagraphNode, $getNodeByKey, $getSelection, $isElementNode, $isNodeSelection, COMMAND_PRIORITY_LOW, KEY_ENTER_COMMAND } from 'lexical'
import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot } from 'reka-ui'
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'
import { mathEditChannel } from '../math/edit'
import { useBlockToolbar } from '../plugins/ContentBlockPlugin'
import { useEditorTheme } from '../theme-context'
import BlockToolbar from './BlockToolbar.vue'

const props = defineProps<{ nodeKey: string, equation: string, displayMode: boolean }>()

const editor = useLexicalComposer()
const editable = useLexicalEditable()
const theme = useEditorTheme()
const { isSelected, setSelected, clearSelection } = useLexicalNodeSelection(props.nodeKey)
const textarea = useTemplateRef<HTMLTextAreaElement>('textarea')

const open = shallowRef(false)
const draft = shallowRef('')

function $node(): MathNode | null {
  const node = $getNodeByKey(props.nodeKey)
  return node && (node.getType() === 'katex-inline' || node.getType() === 'katex-block')
    ? (node as MathNode)
    : null
}

function openEditor() {
  if (!editable.value)
    return
  draft.value = props.equation
  open.value = true
  void nextTick(() => textarea.value?.select())
}

let unregister: (() => void) | undefined
onMounted(() => {
  // Also applies an open request made before mount (a freshly inserted equation).
  unregister = mathEditChannel.register(editor, props.nodeKey, openEditor)
})
onBeforeUnmount(() => unregister?.())

// A click picks the equation; its toolbar, Enter or a double click opens it.
function onClick() {
  if (!editable.value)
    return
  clearSelection()
  setSelected(true)
}

const root = useTemplateRef<{ $el?: HTMLElement } | HTMLElement>('root')
const element = computed(() => {
  const value = root.value
  return value instanceof HTMLElement
    ? value
    : value?.$el ?? null
})
const picked = computed(() => editable.value && isSelected.value && !open.value)
const { showToolbar, toolbarStyle, editAction, onDblclick } = useBlockToolbar(element, picked, editable, openEditor)

// Enter on the picked equation opens it.
let stopEnter: (() => void) | undefined
onMounted(() => {
  stopEnter = editor.registerCommand(KEY_ENTER_COMMAND, (event) => {
    const selection = $getSelection()
    if (!editable.value || !$isNodeSelection(selection) || !selection.has(props.nodeKey))
      return false
    event?.preventDefault()
    openEditor()
    return true
  }, COMMAND_PRIORITY_LOW)
})
onBeforeUnmount(() => stopEnter?.())

/** Puts the Lexical caret right after the equation and gives Lexical focus back. */
function $selectAfter(node: MathNode) {
  if (!props.displayMode) {
    // Offsets default to the end of the next text node; we want right after the equation.
    node.selectNext(0, 0)
    return
  }
  let next = node.getNextSibling()
  if (!$isElementNode(next)) {
    const paragraph = $createParagraphNode()
    node.insertAfter(paragraph)
    next = paragraph
  }
  next.selectStart()
}

/**
 * Closes the popover. `equation` null keeps the current value (cancel); an empty
 * equation removes the node, so an abandoned insert leaves nothing behind.
 */
function close(equation: string | null) {
  open.value = false
  editor.getRootElement()?.focus({ preventScroll: true })
  editor.update(() => {
    const node = $node()
    if (!node)
      return
    const next = equation === null
      ? node.getEquation()
      : equation.trim()
    if (!next) {
      const previous = node.getPreviousSibling()
      node.remove()
      if (previous)
        previous.selectEnd()
      return
    }
    if (next !== node.getEquation())
      node.setEquation(next)
    $selectAfter(node)
  })
}

const apply = () => close(draft.value)
const cancel = () => close(null)

function onKeydown(event: KeyboardEvent) {
  // Inline equations are one line: Enter applies. Block ones take newlines; Cmd/Ctrl+Enter applies.
  const submit = event.key === 'Enter' && (event.metaKey || event.ctrlKey || (!props.displayMode && !event.shiftKey))
  if (submit) {
    event.preventDefault()
    apply()
  }
}
</script>

<template>
  <PopoverRoot :open="open">
    <PopoverAnchor as-child>
      <component
        :is="displayMode ? 'div' : 'span'"
        ref="root"
        class="hlx-math-editor"
        :data-display="displayMode ? 'block' : 'inline'"
        :data-selected="isSelected || open || undefined"
        @click="onClick"
        @dblclick="onDblclick"
      >
        <MathView v-if="equation" :equation="equation" :display-mode="displayMode" />
        <span v-else class="hlx-math-placeholder">{{ displayMode ? '新增數學式' : '數學式' }}</span>
      </component>
    </PopoverAnchor>
    <PopoverPortal>
      <PopoverContent
        class="hlx-root hlx-math-popover"
        :data-variant="theme.variant"
        :data-color-scheme="theme.colorScheme"
        :style="theme.style"
        side="bottom"
        :align="displayMode ? 'center' : 'start'"
        :side-offset="6"
        :collision-padding="8"
        @open-auto-focus.prevent
        @escape-key-down.prevent="cancel"
        @interact-outside="apply"
      >
        <textarea
          ref="textarea"
          v-model="draft"
          class="hlx-math-input"
          :rows="displayMode ? 3 : 1"
          spellcheck="false"
          autocomplete="off"
          aria-label="LaTeX 數學式"
          placeholder="例如 \frac{a}{b}"
          @keydown="onKeydown"
        />
        <div class="hlx-math-preview" aria-live="polite">
          <MathView v-if="draft.trim()" :equation="draft" :display-mode="displayMode" />
          <span v-else class="hlx-math-placeholder">預覽</span>
        </div>
        <div class="hlx-math-actions">
          <span class="hlx-math-hint">{{ displayMode ? '⌘Enter' : 'Enter' }} 套用 · Esc 取消</span>
          <button type="button" class="hlx-math-button" @click="cancel">
            取消
          </button>
          <button type="button" class="hlx-math-button" data-primary @click="apply">
            套用
          </button>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
  <BlockToolbar v-if="showToolbar" label="數學式" :actions="[editAction]" :style="toolbarStyle" />
</template>
