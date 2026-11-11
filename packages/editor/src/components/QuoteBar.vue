<script setup lang="ts">
import type { LexicalEditor, NodeKey } from 'lexical'
import { $isQuoteNode } from '@lexical/rich-text'
import { $addUpdateTag, $getNodeByKey, HISTORY_PUSH_TAG, SKIP_DOM_SELECTION_TAG } from 'lexical'
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { $createRichQuoteNode, $isRichQuoteNode } from '../nodes/RichQuoteNode'
import { useEditorTheme } from '../theme-context'

export interface QuoteState {
  key: NodeKey
  attribution: string
}

const props = defineProps<{ state: QuoteState, editor: LexicalEditor }>()

const theme = useEditorTheme()
const position = shallowRef<{ top: string, left: string } | null>(null)
const value = shallowRef('')
// What the document has or is about to have: Enter then blur shouldn't save twice.
let saved = ''

watch(() => props.state, (state) => {
  value.value = state.attribution
  saved = state.attribution
}, { immediate: true })

/* Position: fixed, below the quote's bottom right corner, clear of a callout's bar above. */

function measure() {
  const box = props.editor.getElementByKey(props.state.key)?.getBoundingClientRect()
  position.value = box
    ? { top: `${box.bottom}px`, left: `${box.right}px` }
    : null
}

watch(() => props.state, measure, { flush: 'post' })
let unregister: (() => void) | undefined
onMounted(() => {
  measure()
  window.addEventListener('scroll', measure, true)
  window.addEventListener('resize', measure)
  unregister = props.editor.registerUpdateListener(measure)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', measure, true)
  window.removeEventListener('resize', measure)
  unregister?.()
})

function save(leaving = false) {
  const next = value.value.trim()
  if (next === saved)
    return
  saved = next
  const { key } = props.state
  props.editor.update(() => {
    $addUpdateTag(HISTORY_PUSH_TAG)
    // On the way to wherever was just clicked: don't pull the caret back.
    if (leaving)
      $addUpdateTag(SKIP_DOM_SELECTION_TAG)
    const node = $getNodeByKey(key)
    if ($isRichQuoteNode(node)) {
      node.setAttribution(next)
    }
    else if ($isQuoteNode(node)) {
      const rich = $createRichQuoteNode(next)
      rich.setFormat(node.getFormatType())
      rich.setIndent(node.getIndent())
      rich.setDirection(node.getDirection())
      node.replace(rich, true)
    }
  })
}

function submit(event: KeyboardEvent) {
  // The Enter that picks a word isn't ours.
  if (event.isComposing)
    return
  event.preventDefault()
  save()
  props.editor.focus()
}

function cancel(event: KeyboardEvent) {
  if (event.isComposing)
    return
  event.preventDefault()
  value.value = saved
  props.editor.focus()
}
</script>

<template>
  <Teleport to="body">
    <!-- Shares the callout bar's class: its look, and what counts as focus staying in the editor. -->
    <div
      v-if="position"
      class="hlx-root hlx-callout-bar hlx-quote-bar"
      :data-variant="theme.variant"
      :data-color-scheme="theme.colorScheme"
      :style="[theme.style, position]"
    >
      <input
        v-model="value"
        type="text"
        aria-label="出處"
        placeholder="出處"
        autocomplete="off"
        @blur="save(true)"
        @keydown.enter="submit"
        @keydown.esc="cancel"
      >
    </div>
  </Teleport>
</template>
