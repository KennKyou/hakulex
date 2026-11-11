<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { TableAction } from './table-actions'
import { useEditorTheme } from '@hakulex/editor'
import { useLexicalComposer, useLexicalEditable, useLexicalRegister } from '@hakulex/vue-lexical'
import { $findCellNode, $isTableCellNode, $isTableSelection } from '@lexical/table'
import { mergeRegister } from '@lexical/utils'
import { Ellipsis, Plus } from '@lucide/vue'
import { $getNearestNodeFromDOMNode, $getNodeByKey, $getSelection, $isRangeSelection } from 'lexical'
import {
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { $getHeaderState, $runTableAction } from './table-actions'

const HIDE_DELAY = 300
const HANDLE_SIZE = 20
const GAP = 6
const APPEND_SIZE = 12
// Stays inside the table's bottom margin, so the bar never touches the next line.
const APPEND_GAP = 2

interface Layout {
  row: CSSProperties
  column: CSSProperties | null
  appendRow: CSSProperties
  appendColumn: CSSProperties
  headerRow: boolean
  headerColumn: boolean
}

const editor = useLexicalComposer()
const editable = useLexicalEditable()
const theme = useEditorTheme()

const hoverKey = shallowRef<string | null>(null)
const selectionKey = shallowRef<string | null>(null)
/** The cell a menu acts on stays fixed while the pointer is inside that menu. */
const frozenKey = shallowRef<string | null>(null)
const layout = shallowRef<Layout | null>(null)

const focused = shallowRef(false)

// A selection outlives focus, so it alone would leave handles behind on other pages.
const activeKey = computed(() => frozenKey.value ?? hoverKey.value ?? (focused.value ? selectionKey.value : null))
const visible = computed(() => editable.value && layout.value !== null)

/* Position: fixed, measured from the cell, so it follows page and table scrolling. */

function measure() {
  const key = activeKey.value
  const cellElement = key
    ? editor.getElementByKey(key)
    : null
  const table = cellElement?.closest('table')
  if (!key || !cellElement || !table || !cellElement.isConnected) {
    layout.value = null
    return
  }
  const header = editor.read(() => {
    const node = $getNodeByKey(key)
    return $isTableCellNode(node)
      ? $getHeaderState(node)
      : null
  })
  if (!header) {
    layout.value = null
    return
  }

  const cell = cellElement.getBoundingClientRect()
  const tableBox = table.getBoundingClientRect()
  const clip = table.parentElement?.getBoundingClientRect()
  const clipLeft = clip?.width
    ? Math.max(tableBox.left, clip.left)
    : tableBox.left
  const clipRight = clip?.width
    ? Math.min(tableBox.right, clip.right)
    : tableBox.right
  const center = cell.left + cell.width / 2

  layout.value = {
    row: {
      top: `${cell.top + cell.height / 2 - HANDLE_SIZE / 2}px`,
      left: `${clipLeft - HANDLE_SIZE - GAP}px`,
    },
    // A column scrolled out of the wrapper has nowhere to show its handle.
    column: center < clipLeft || center > clipRight
      ? null
      : {
          top: `${tableBox.top - HANDLE_SIZE - GAP}px`,
          left: `${center - HANDLE_SIZE / 2}px`,
        },
    appendRow: {
      top: `${tableBox.bottom + APPEND_GAP}px`,
      left: `${clipLeft}px`,
      width: `${clipRight - clipLeft}px`,
      height: `${APPEND_SIZE}px`,
    },
    appendColumn: {
      top: `${tableBox.top}px`,
      left: `${clipRight + APPEND_GAP}px`,
      width: `${APPEND_SIZE}px`,
      height: `${tableBox.height}px`,
    },
    headerRow: header.row,
    headerColumn: header.column,
  }
}

watch(activeKey, measure)

/* Which cell: the one under the pointer, else the one holding the caret. */

let hideTimer: ReturnType<typeof setTimeout> | undefined
let overHandles = false

function scheduleHoverClear() {
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    if (!overHandles)
      hoverKey.value = null
  }, HIDE_DELAY)
}

function onHandlesEnter() {
  overHandles = true
  clearTimeout(hideTimer)
}

function onHandlesLeave() {
  overHandles = false
  scheduleHoverClear()
}

useLexicalRegister((lexical) => {
  const onMouseMove = (event: MouseEvent) => {
    const cell = (event.target as HTMLElement).closest('td, th')
    if (!cell) {
      if (!overHandles)
        scheduleHoverClear()
      return
    }
    clearTimeout(hideTimer)
    hoverKey.value = lexical.read(() => {
      const node = $getNearestNodeFromDOMNode(cell)
      return node
        ? $findCellNode(node)?.getKey() ?? null
        : null
    })
  }
  const onMouseLeave = () => {
    if (!overHandles)
      scheduleHoverClear()
  }
  const unregisterRoot = lexical.registerRootListener((root, previous) => {
    previous?.removeEventListener('mousemove', onMouseMove)
    previous?.removeEventListener('mouseleave', onMouseLeave)
    root?.addEventListener('mousemove', onMouseMove)
    root?.addEventListener('mouseleave', onMouseLeave)
  })
  window.addEventListener('scroll', measure, true)
  window.addEventListener('resize', measure)
  return mergeRegister(
    unregisterRoot,
    lexical.registerUpdateListener(({ editorState }) => {
      selectionKey.value = editorState.read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) && !$isTableSelection(selection))
          return null
        return $findCellNode(selection.focus.getNode())?.getKey() ?? null
      })
      measure()
    }),
    () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    },
  )
})

function readFocus() {
  const active = document.activeElement
  focused.value = !!active && (
    !!editor.getRootElement()?.contains(active) || !!active.closest('.hlx-table-handles')
  )
}

onMounted(() => {
  readFocus()
  document.addEventListener('focusin', readFocus)
  document.addEventListener('focusout', readFocus)
})

onBeforeUnmount(() => {
  clearTimeout(hideTimer)
  document.removeEventListener('focusin', readFocus)
  document.removeEventListener('focusout', readFocus)
})

/* Actions */

function run(action: TableAction) {
  const key = activeKey.value
  if (!key)
    return
  editor.update(() => {
    const node = $getNodeByKey(key)
    if (!$isTableCellNode(node))
      return
    node.selectEnd()
    $runTableAction(node, action)
  })
}

function onAppend(action: TableAction) {
  run(action)
  editor.focus()
}

function onMenuOpen(open: boolean) {
  if (open) {
    frozenKey.value = activeKey.value
    return
  }
  // Wait for the item's action, which still needs the frozen cell.
  nextTick(() => {
    frozenKey.value = null
  })
}

/** The menu would return focus to its trigger; the author was typing in the table. */
function returnFocus(event: Event) {
  event.preventDefault()
  editor.focus()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible && layout"
      class="hlx-root hlx-table-handles"
      :data-variant="theme.variant"
      :data-color-scheme="theme.colorScheme"
      :style="theme.style"
      @mouseenter="onHandlesEnter"
      @mouseleave="onHandlesLeave"
    >
      <DropdownMenuRoot @update:open="onMenuOpen">
        <DropdownMenuTrigger class="hlx-table-handle" aria-label="列操作" title="列操作" :style="layout.row">
          <Ellipsis :size="14" :stroke-width="2" />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            class="hlx-root hlx-table-menu"
            side="right"
            :side-offset="4"
            :data-variant="theme.variant"
            :data-color-scheme="theme.colorScheme"
            :style="theme.style"
            @close-auto-focus="returnFocus"
          >
            <DropdownMenuItem class="hlx-table-menu-item" @select="run('insert-row-above')">
              在上方插入列
            </DropdownMenuItem>
            <DropdownMenuItem class="hlx-table-menu-item" @select="run('insert-row-below')">
              在下方插入列
            </DropdownMenuItem>
            <DropdownMenuSeparator class="hlx-table-menu-separator" />
            <DropdownMenuCheckboxItem class="hlx-table-menu-item" :model-value="layout.headerRow" @select="run('toggle-header-row')">
              標題列
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator class="hlx-table-menu-separator" />
            <DropdownMenuItem class="hlx-table-menu-item" data-destructive @select="run('delete-row')">
              刪除列
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>

      <DropdownMenuRoot v-if="layout.column" @update:open="onMenuOpen">
        <DropdownMenuTrigger class="hlx-table-handle" aria-label="欄操作" title="欄操作" :style="layout.column">
          <Ellipsis :size="14" :stroke-width="2" />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            class="hlx-root hlx-table-menu"
            side="bottom"
            :side-offset="4"
            :data-variant="theme.variant"
            :data-color-scheme="theme.colorScheme"
            :style="theme.style"
            @close-auto-focus="returnFocus"
          >
            <DropdownMenuItem class="hlx-table-menu-item" @select="run('insert-column-left')">
              在左側插入欄
            </DropdownMenuItem>
            <DropdownMenuItem class="hlx-table-menu-item" @select="run('insert-column-right')">
              在右側插入欄
            </DropdownMenuItem>
            <DropdownMenuSeparator class="hlx-table-menu-separator" />
            <DropdownMenuCheckboxItem class="hlx-table-menu-item" :model-value="layout.headerColumn" @select="run('toggle-header-column')">
              標題欄
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator class="hlx-table-menu-separator" />
            <DropdownMenuItem class="hlx-table-menu-item" data-destructive @select="run('delete-column')">
              刪除欄
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>

      <button
        type="button"
        class="hlx-table-append"
        aria-label="新增列"
        title="新增列"
        :style="layout.appendRow"
        @mousedown.prevent
        @click="onAppend('append-row')"
      >
        <Plus :size="12" :stroke-width="2" />
      </button>
      <button
        type="button"
        class="hlx-table-append"
        aria-label="新增欄"
        title="新增欄"
        :style="layout.appendColumn"
        @mousedown.prevent
        @click="onAppend('append-column')"
      >
        <Plus :size="12" :stroke-width="2" />
      </button>
    </div>
  </Teleport>
</template>
