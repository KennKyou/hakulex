<script setup lang="ts">
import type { MermaidNode } from '../nodes/MermaidNode'
import { MermaidView } from '@hakulex/renderer'
import { useLexicalComposer, useLexicalEditable, useLexicalNodeSelection } from '@hakulex/vue-lexical'
import { $createParagraphNode, $getNodeByKey, $getSelection, $isElementNode, $isNodeSelection, COMMAND_PRIORITY_LOW, KEY_ENTER_COMMAND } from 'lexical'
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'
import { mermaidEditChannel } from '../mermaid/edit'
import { useBlockToolbar } from '../plugins/ContentBlockPlugin'
import BlockToolbar from './BlockToolbar.vue'
import MermaidDialog from './MermaidDialog.vue'

const props = defineProps<{ nodeKey: string, diagram: string }>()

const editor = useLexicalComposer()
const editable = useLexicalEditable()
const { isSelected, setSelected, clearSelection } = useLexicalNodeSelection(props.nodeKey)
const open = shallowRef(false)

function $node(): MermaidNode | null {
  const node = $getNodeByKey(props.nodeKey)
  return node?.getType() === 'mermaid'
    ? (node as MermaidNode)
    : null
}

function openEditor() {
  if (editable.value)
    open.value = true
}

let unregister: (() => void) | undefined
onMounted(() => {
  // Also applies an open request made before mount (a freshly inserted diagram).
  unregister = mermaidEditChannel.register(editor, props.nodeKey, openEditor)
})
onBeforeUnmount(() => unregister?.())

// A click picks the diagram; its toolbar, Enter or a double click opens it.
function onClick() {
  if (!editable.value)
    return
  clearSelection()
  setSelected(true)
}

const root = useTemplateRef<HTMLElement>('root')
const picked = computed(() => editable.value && isSelected.value && !open.value)
const { showToolbar, toolbarStyle, editAction, onDblclick } = useBlockToolbar(root, picked, editable, openEditor)

// Enter on the picked diagram opens it.
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

/**
 * Returns to the document after the dialog. `source` null keeps the diagram
 * (cancel); an empty diagram is removed, so an abandoned insert leaves nothing.
 */
function finish(source: string | null) {
  editor.getRootElement()?.focus({ preventScroll: true })
  editor.update(() => {
    const node = $node()
    if (!node)
      return
    const next = source === null
      ? node.getDiagram()
      : source.trim()
    if (!next) {
      const previous = node.getPreviousSibling()
      node.remove()
      previous?.selectEnd()
      return
    }
    if (next !== node.getDiagram())
      node.setDiagram(next)
    let after = node.getNextSibling()
    if (!$isElementNode(after)) {
      after = $createParagraphNode()
      node.insertAfter(after)
    }
    after.selectStart()
  })
}
</script>

<template>
  <div
    ref="root"
    class="hlx-mermaid-editor"
    :data-selected="isSelected || open || undefined"
    @click="onClick"
    @dblclick="onDblclick"
  >
    <MermaidView v-if="diagram.trim()" :source="diagram" />
    <div v-else class="hlx-mermaid-empty">
      雙擊建立 Mermaid 圖表
    </div>
  </div>
  <BlockToolbar v-if="showToolbar" label="Mermaid 圖表" :actions="[editAction]" :style="toolbarStyle" />
  <MermaidDialog v-model:open="open" :source="diagram" @save="finish" @cancel="finish(null)" />
</template>
