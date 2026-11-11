<script setup lang="ts">
import type { GridCell, GridNode } from '../nodes/GridNode'
import { $addUpdateTag, $getNodeByKey, $getRoot, $isParagraphNode, HISTORY_PUSH_TAG } from 'lexical'
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { latestState, onNestedChange } from '../nested/content'
import { focusNested, NestedEditorArea } from '../nested/keys'
import { $isGridNode } from '../nodes/GridNode'
import { nestedFocusChannel, useNestedBlock } from '../plugins/NestedBlockPlugin'

const props = defineProps<{
  nodeKey: string
  cols: number
  gap: string
  cells: readonly GridCell[]
}>()

const COLUMN_CHOICES = [1, 2, 3, 4]

const { outer, editable, selected, leave, selectBlock, onPointerDown, onClick } = useNestedBlock(props.nodeKey)

/* Moving focus around */

function exitCell(index: number, direction: 'up' | 'down') {
  const target = props.cells[index + (direction === 'up'
    ? -props.cols
    : props.cols)]
  if (target) {
    focusNested(target.editor, direction === 'up'
      ? 'end'
      : 'start')
  }
  else {
    leave(direction)
  }
}

let unregister: (() => void) | undefined
let stopWatchingCells: (() => void) | undefined
// Whether the last row is blank depends on content, which the outer editor doesn't hold.
const contentChanges = shallowRef(0)
onMounted(() => {
  // Also applies a request made before mount (a freshly inserted block).
  unregister = nestedFocusChannel.register(outer, props.nodeKey, (target) => {
    if (target === 'first')
      focusNested(props.cells[0]?.editor, 'start')
    else
      focusNested(props.cells.at(-1)?.editor, 'end')
  })
  stopWatchingCells = onNestedChange(outer, () => contentChanges.value++)
})
onBeforeUnmount(() => {
  unregister?.()
  stopWatchingCells?.()
})

/* Columns and rows */

function isBlank(cell: GridCell) {
  return latestState(cell.editor).read(() => {
    const blocks = $getRoot().getChildren()
    return blocks.length === 0 || (blocks.length === 1 && $isParagraphNode(blocks[0]) && blocks[0].isEmpty())
  })
}

const canRemoveRow = computed(() => {
  void contentChanges.value
  const lastRow = props.cells.length % props.cols || props.cols
  return props.cells.length > lastRow && props.cells.slice(-lastRow).every(isBlank)
})

function change(edit: (node: GridNode) => void) {
  outer.update(() => {
    const node = $getNodeByKey(props.nodeKey)
    if (!$isGridNode(node))
      return
    $addUpdateTag(HISTORY_PUSH_TAG)
    edit(node)
  })
}

function setCols(cols: number) {
  if (cols !== props.cols) {
    change(node => node.setCols(cols))
  }
}

// Focus goes to the new row once it is on the page.
let focusAfterRender: GridCell | null = null
watch(() => props.cells, () => {
  if (!focusAfterRender)
    return
  const { editor } = focusAfterRender
  focusAfterRender = null
  // A tick more: its element comes from a child that may not have mounted yet.
  void nextTick(() => focusNested(editor, 'start'))
}, { flush: 'post' })

function addRow() {
  change((node) => {
    focusAfterRender = node.addRow()
  })
}

function removeRow() {
  if (!canRemoveRow.value)
    return
  change(node => node.removeLastRow())
}
</script>

<template>
  <div
    class="hlx-grid-editor"
    :data-selected="selected || undefined"
    @pointerdown.capture="onPointerDown"
    @click="onClick"
  >
    <div v-if="editable" class="hlx-grid-toolbar" role="toolbar" aria-label="格狀版面" @mousedown.prevent>
      <button
        v-for="choice in COLUMN_CHOICES"
        :key="choice"
        type="button"
        :aria-label="`${choice} 欄`"
        :title="`${choice} 欄`"
        :aria-pressed="choice === cols"
        @click="setCols(choice)"
      >
        {{ choice }}
      </button>
      <span class="hlx-grid-toolbar-divider" aria-hidden="true" />
      <button type="button" aria-label="新增列" title="新增列" @click="addRow">
        ＋
      </button>
      <button type="button" aria-label="移除最後一列" title="移除最後一列（要全部空白）" :disabled="!canRemoveRow" @click="removeRow">
        －
      </button>
    </div>
    <div class="hlx-grid" :style="{ '--hlx-grid-cols': String(cols), 'gap': gap }">
      <div v-for="(cell, index) in cells" :key="cell.uid" class="hlx-grid-cell">
        <NestedEditorArea
          :content="cell"
          :on-exit="(direction: 'up' | 'down') => exitCell(index, direction)"
          :on-escape="selectBlock"
        />
      </div>
    </div>
  </div>
</template>
