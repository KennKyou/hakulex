<script setup lang="ts">
import type { StepsFocusTarget } from '../nodes/StepsNode'
import type { StepEntry } from '../steps/nested'
import { useLexicalComposer, useLexicalEditable, useLexicalNodeSelection } from '@hakulex/vue-lexical'
import { $addUpdateTag, $getNodeByKey, HISTORY_PUSH_TAG, SKIP_DOM_SELECTION_TAG } from 'lexical'
import { computed, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import { $selectNode } from '../media/block-navigation'
import { $leaveBlock, focusNested, NestedEditorArea, releaseOuterSelection } from '../nested/keys'
import { $isStepsNode, stepsFocusChannel } from '../nodes/StepsNode'
import { createBlankStep } from '../steps/document'
import { createStepEntry } from '../steps/nested'

const props = defineProps<{
  nodeKey: string
  steps: readonly StepEntry[]
}>()

const outer = useLexicalComposer()
const editable = useLexicalEditable()
const { isSelected, setSelected, clearSelection } = useLexicalNodeSelection(props.nodeKey)
const selected = computed(() => editable.value && isSelected.value)
const container = useTemplateRef<HTMLElement>('container')

/* Moving focus around */

const titleOf = (step: StepEntry) => container.value?.querySelector<HTMLInputElement>(`[data-step-uid="${step.uid}"] .hlx-step-title-input`)

function focusTitle(step: StepEntry | undefined) {
  if (step)
    titleOf(step)?.focus()
}

function focusContent(step: StepEntry | undefined, where: 'start' | 'end') {
  focusNested(step?.editor, where)
}

function leave(direction: 'up' | 'down') {
  outer.getRootElement()?.focus({ preventScroll: true })
  outer.update(() => {
    const node = $getNodeByKey(props.nodeKey)
    if (node)
      $leaveBlock(node, direction)
  })
}

function selectBlock() {
  outer.getRootElement()?.focus({ preventScroll: true })
  outer.update(() => {
    const node = $getNodeByKey(props.nodeKey)
    if (node)
      $selectNode(node)
  })
}

function exitContent(step: StepEntry, direction: 'up' | 'down') {
  if (direction === 'up') {
    focusTitle(step)
    return
  }
  const next = props.steps[props.steps.indexOf(step) + 1]
  if (next)
    focusTitle(next)
  else
    leave('down')
}

function onFocusRequest(target: StepsFocusTarget) {
  if (target === 'first-title')
    focusTitle(props.steps[0])
  else
    focusContent(props.steps.at(-1), 'end')
}

let unregister: (() => void) | undefined
onMounted(() => {
  // Also applies a request made before mount (a freshly inserted block).
  unregister = stepsFocusChannel.register(outer, props.nodeKey, onFocusRequest)
})
onBeforeUnmount(() => unregister?.())

/* Changing the steps */

/** Changes the list as one undo step. */
function change(edit: (steps: readonly StepEntry[]) => readonly StepEntry[], leaving = false) {
  outer.update(() => {
    const node = $getNodeByKey(props.nodeKey)
    if (!$isStepsNode(node))
      return
    const current = node.getSteps()
    const next = edit(current)
    if (next === current)
      return
    $addUpdateTag(HISTORY_PUSH_TAG)
    // On the way to wherever was just clicked: don't pull the caret back.
    if (leaving)
      $addUpdateTag(SKIP_DOM_SELECTION_TAG)
    node.setSteps(next)
  })
}

function saveTitle(step: StepEntry, value: string, leaving: boolean) {
  const title = value.trim()
  change(steps => steps.some(item => item.uid === step.uid && item.title !== title)
    ? steps.map(item => item.uid === step.uid
        ? { ...item, title }
        : item)
    : steps, leaving)
}

function onTitleKeydown(step: StepEntry, event: KeyboardEvent) {
  // The Enter and Esc that deal with a word being composed aren't ours.
  if (event.isComposing)
    return
  const input = event.target as HTMLInputElement
  const index = props.steps.indexOf(step)
  switch (event.key) {
    case 'Enter':
      event.preventDefault()
      saveTitle(step, input.value, false)
      focusContent(step, 'start')
      break
    case 'Escape':
      event.preventDefault()
      if (input.value !== step.title)
        input.value = step.title
      else
        selectBlock()
      break
    case 'ArrowDown':
      event.preventDefault()
      focusContent(step, 'start')
      break
    case 'ArrowUp':
      event.preventDefault()
      if (index > 0)
        focusContent(props.steps[index - 1], 'end')
      else
        leave('up')
      break
  }
}

// Focus goes to the new step's title once it is on the page.
let focusAfterRender: number | null = null
watch(() => props.steps, (steps) => {
  if (focusAfterRender === null)
    return
  focusTitle(steps.find(step => step.uid === focusAfterRender))
  focusAfterRender = null
}, { flush: 'post' })

function add(index: number) {
  change((steps) => {
    const entry = createStepEntry(outer, createBlankStep())
    focusAfterRender = entry.uid
    return [
      ...steps.slice(0, index + 1),
      entry,
      ...steps.slice(index + 1),
    ]
  })
}

function remove(index: number) {
  change((steps) => {
    const rest = steps.filter((_, i) => i !== index)
    return rest.length
      ? rest
      : [
          createStepEntry(outer, createBlankStep()),
        ]
  })
}

function move(index: number, delta: -1 | 1) {
  change((steps) => {
    const other = index + delta
    if (other < 0 || other >= steps.length)
      return steps
    const next = [...steps]
    ;[next[index], next[other]] = [next[other], next[index]]
    return next
  })
}

function onPointerDown(event: PointerEvent) {
  if (event.button === 0 && (event.target as Element).closest('input, .hlx-step-content'))
    releaseOuterSelection(outer)
}

function onClick(event: MouseEvent) {
  // Only the parts that aren't for editing pick the whole block.
  if (!editable.value || (event.target as Element).closest('input, button, .hlx-step-content'))
    return
  clearSelection()
  setSelected(true)
}
</script>

<template>
  <div
    ref="container"
    class="hlx-steps-editor"
    :data-selected="selected || undefined"
    @pointerdown.capture="onPointerDown"
    @click="onClick"
  >
    <ol class="hlx-steps">
      <li v-for="(step, index) in steps" :key="step.uid" class="hlx-step" :data-step-uid="step.uid">
        <span class="hlx-step-number" aria-hidden="true">{{ index + 1 }}</span>
        <div class="hlx-step-header">
          <!-- The events stop here: what happens in this input is none of Lexical's business. -->
          <input
            class="hlx-step-title-input"
            :value="step.title"
            :readonly="!editable"
            placeholder="步驟標題"
            :aria-label="`第 ${index + 1} 步的標題`"
            autocomplete="off"
            @keydown.stop="onTitleKeydown(step, $event)"
            @keyup.stop
            @keypress.stop
            @beforeinput.stop
            @input.stop
            @paste.stop
            @copy.stop
            @cut.stop
            @compositionstart.stop
            @compositionupdate.stop
            @compositionend.stop
            @blur="editable && saveTitle(step, ($event.target as HTMLInputElement).value, true)"
          >
          <div v-if="editable" class="hlx-step-actions">
            <button type="button" data-action="up" aria-label="上移" title="上移" :disabled="index === 0" @click="move(index, -1)">
              ↑
            </button>
            <button type="button" data-action="down" aria-label="下移" title="下移" :disabled="index === steps.length - 1" @click="move(index, 1)">
              ↓
            </button>
            <button type="button" data-action="add" aria-label="在後面新增步驟" title="在後面新增步驟" @click="add(index)">
              ＋
            </button>
            <button type="button" data-action="remove" aria-label="刪除步驟" title="刪除步驟" @click="remove(index)">
              ×
            </button>
          </div>
        </div>
        <div class="hlx-step-content">
          <NestedEditorArea
            :content="step"
            :on-exit="(direction: 'up' | 'down') => exitContent(step, direction)"
            :on-escape="selectBlock"
          />
        </div>
      </li>
    </ol>
  </div>
</template>
