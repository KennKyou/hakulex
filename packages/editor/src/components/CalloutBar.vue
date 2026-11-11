<script setup lang="ts">
import type { CalloutType } from '@hakulex/renderer'
import type { LexicalEditor, NodeKey } from 'lexical'
import { CALLOUT_LABELS, CALLOUT_TYPES } from '@hakulex/renderer'
import { $addUpdateTag, $getNodeByKey, HISTORY_PUSH_TAG, SKIP_DOM_SELECTION_TAG } from 'lexical'
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { $isCalloutNode, $isDetailsNode } from '../nodes/CalloutNodes'
import { useEditorTheme } from '../theme-context'

export type CalloutState
  = | { key: NodeKey, kind: 'alert' | 'banner', type: CalloutType }
    | { key: NodeKey, kind: 'details', summary: string }

const props = defineProps<{ state: CalloutState, editor: LexicalEditor }>()

const theme = useEditorTheme()
const position = shallowRef<{ top: string, left: string } | null>(null)
const summary = shallowRef('')

watch(() => props.state, (state) => {
  if (state.kind === 'details')
    summary.value = state.summary
}, { immediate: true })

/* Position: fixed, above the block's top right corner, following scrolling. */

function measure() {
  const box = props.editor.getElementByKey(props.state.key)?.getBoundingClientRect()
  position.value = box
    ? { top: `${box.top}px`, left: `${box.right}px` }
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

/* Actions: each is one undo step, and hands focus back to the caret in the block. */

function edit(action: (key: NodeKey) => void) {
  props.editor.update(() => {
    $addUpdateTag(HISTORY_PUSH_TAG)
    action(props.state.key)
  })
  props.editor.focus()
}

function setType(event: Event) {
  const type = (event.target as HTMLSelectElement).value as CalloutType
  edit((key) => {
    const node = $getNodeByKey(key)
    if ($isCalloutNode(node) && !$isDetailsNode(node))
      node.setCalloutType(type)
  })
}

function saveSummary(leaving = false) {
  if (props.state.kind !== 'details' || props.state.summary === summary.value)
    return
  const value = summary.value
  props.editor.update(() => {
    $addUpdateTag(HISTORY_PUSH_TAG)
    // On the way to wherever was just clicked: don't pull the caret back.
    if (leaving)
      $addUpdateTag(SKIP_DOM_SELECTION_TAG)
    const node = $getNodeByKey(props.state.key)
    if ($isDetailsNode(node))
      node.setSummary(value)
  })
}

function submitSummary() {
  saveSummary()
  props.editor.focus()
}

function cancelSummary() {
  if (props.state.kind === 'details')
    summary.value = props.state.summary
  props.editor.focus()
}

function remove() {
  edit((key) => {
    const node = $getNodeByKey(key)
    if (!$isCalloutNode(node))
      return
    for (const child of node.getChildren())
      node.insertBefore(child)
    node.remove()
  })
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="position"
      class="hlx-root hlx-callout-bar"
      :data-variant="theme.variant"
      :data-color-scheme="theme.colorScheme"
      :style="[theme.style, position]"
    >
      <select
        v-if="state.kind !== 'details'"
        aria-label="區塊類型"
        :value="state.type"
        @change="setType"
      >
        <option v-for="type in CALLOUT_TYPES" :key="type" :value="type">
          {{ CALLOUT_LABELS[type] }}
        </option>
      </select>
      <input
        v-else
        v-model="summary"
        type="text"
        aria-label="摘要"
        placeholder="摘要"
        autocomplete="off"
        @blur="saveSummary(true)"
        @keydown.enter.prevent="submitSummary"
        @keydown.esc.prevent="cancelSummary"
      >
      <button type="button" aria-label="移除區塊" title="移除區塊，保留內容" @mousedown.prevent @click="remove">
        ×
      </button>
    </div>
  </Teleport>
</template>
