<script setup lang="ts">
import { footnoteItems, renderFootnoteSection } from '@hakulex/renderer'
import { useLexicalComposer, useLexicalEditable } from '@hakulex/vue-lexical'
import { SKIP_DOM_SELECTION_TAG } from 'lexical'
import { computed, nextTick, useTemplateRef, watch } from 'vue'
import { $removeFootnote, $selectAfterFootnote, $setFootnoteContent } from '../footnote/document'
import { footnoteStore } from '../footnote/state'

const props = defineProps<{ nodeKey: string, definitions: Record<string, string> }>()

const editor = useLexicalComposer()
const editable = useLexicalEditable()
const { state, focus } = footnoteStore(editor)
const list = useTemplateRef<HTMLOListElement>('list')

// Readers get exactly what the renderer gives them. Reads the state as it renders, so a
// change patches the DOM instead of replacing it, which would lose the `:target` highlight.
function ReadOnly() {
  const { numbers, definitions } = state.value
  return renderFootnoteSection(footnoteItems({
    numbers,
    definitions: new Map([...definitions].filter(([, content]) => content.trim())),
  }))
}

interface Row {
  identifier: string
  number: number | undefined
  content: string
}

/** Numbered notes first, then the ones nothing refers to. */
const rows = computed<Row[]>(() => {
  const { numbers } = state.value
  const order = (row: Row) => row.number ?? Number.POSITIVE_INFINITY
  return Object.entries(props.definitions)
    .map(([identifier, content]) => ({
      identifier,
      content,
      number: numbers.get(identifier),
    }))
    .sort((a, b) => order(a) - order(b))
})

const label = (row: Row) => String(row.number ?? row.identifier)

function inputFor(identifier: string) {
  return [
    ...(list.value?.querySelectorAll<HTMLInputElement>('input') ?? []),
  ]
    .find(input => input.closest('li')?.dataset.hlxDefinition === identifier)
}

// The note may have only just been added, so this waits for it to be on screen.
const returnTo = new Map<string, string>()
watch([focus, rows], async () => {
  const request = focus.value
  if (!request || !editable.value)
    return
  await nextTick()
  const input = inputFor(request.identifier)
  if (!input)
    return
  focus.value = null
  returnTo.set(request.identifier, request.refKey)
  input.focus()
  input.select()
}, { immediate: true })

function commit(row: Row, value: string, leaving = false) {
  // On the way to wherever was just clicked: don't pull the caret back.
  editor.update(() => $setFootnoteContent(props.nodeKey, row.identifier, value), leaving
    ? { tag: SKIP_DOM_SELECTION_TAG }
    : undefined)
}

function backToText(row: Row) {
  const refKey = returnTo.get(row.identifier) ?? state.value.firstKeys.get(row.identifier)
  editor.update(() => $selectAfterFootnote(refKey))
  returnTo.delete(row.identifier)
  editor.getRootElement()?.focus({ preventScroll: true })
}

// Set while handing the caret back with Enter or Escape, so the blur that follows writes
// nothing: Enter has saved already, and Escape has put the old text back.
let returning = false

function onBlur(row: Row, event: FocusEvent) {
  if (!returning)
    commit(row, (event.target as HTMLInputElement).value, true)
}

function onKeydown(row: Row, event: KeyboardEvent) {
  const input = event.target as HTMLInputElement
  if (event.key === 'Enter') {
    event.preventDefault()
    commit(row, input.value)
    returning = true
    backToText(row)
    returning = false
  }
  else if (event.key === 'Escape') {
    event.preventDefault()
    returning = true
    input.value = row.content
    backToText(row)
    returning = false
  }
}

function remove(row: Row) {
  editor.update(() => $removeFootnote(props.nodeKey, row.identifier))
  editor.getRootElement()?.focus({ preventScroll: true })
}

// The input is its own world: none of this is for Lexical, which would take ⌘Z as its own undo.
const contain = {
  keyup: (event: Event) => event.stopPropagation(),
  beforeinput: (event: Event) => event.stopPropagation(),
  input: (event: Event) => event.stopPropagation(),
  paste: (event: Event) => event.stopPropagation(),
  copy: (event: Event) => event.stopPropagation(),
  cut: (event: Event) => event.stopPropagation(),
  drop: (event: Event) => event.stopPropagation(),
  compositionstart: (event: Event) => event.stopPropagation(),
  compositionend: (event: Event) => event.stopPropagation(),
  click: (event: Event) => event.stopPropagation(),
  mousedown: (event: Event) => event.stopPropagation(),
}
</script>

<template>
  <ReadOnly v-if="!editable" />
  <section v-else class="hlx-footnotes hlx-footnotes--editing" role="doc-endnotes" data-hlx-footnotes="" contenteditable="false">
    <hr class="hlx-footnotes-divider">
    <ol ref="list" class="hlx-footnotes-list">
      <li
        v-for="row in rows"
        :key="row.identifier"
        class="hlx-footnote"
        :class="{ 'hlx-footnote--orphan': row.number === undefined }"
        :value="row.number"
        :data-hlx-definition="row.identifier"
      >
        <input
          class="hlx-footnote-input"
          type="text"
          :value="row.content"
          :aria-label="`註腳 ${label(row)} 的內容`"
          placeholder="輸入註腳內容"
          autocomplete="off"
          v-on="contain"
          @keydown.stop="onKeydown(row, $event)"
          @blur="onBlur(row, $event)"
        >
        <span v-if="row.number === undefined" class="hlx-footnote-orphan">未被引用</span>
        <button
          type="button"
          class="hlx-footnote-remove"
          :aria-label="`刪除註腳 ${label(row)}`"
          :title="`刪除註腳 ${label(row)}`"
          @mousedown.stop.prevent
          @click.stop="remove(row)"
        >
          ×
        </button>
      </li>
    </ol>
  </section>
</template>
