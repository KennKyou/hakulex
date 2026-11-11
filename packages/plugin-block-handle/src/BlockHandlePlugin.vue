<script setup lang="ts">
import type { BlockType } from '@hakulex/editor'
import type { CSSProperties } from 'vue'
import {
  $canMoveBlock,
  $canTurnBlock,
  $deleteBlock,
  $duplicateBlocks,
  $getBlockType,
  $isFootnoteSectionNode,
  $moveBlockAfter,
  $moveBlocks,
  $selectionBlockKeys,
  $turnBlocksInto,
  TURNABLE_BLOCK_TYPES,
  useEditorTheme,
} from '@hakulex/editor'
import { useLexicalComposer, useLexicalEditable, useLexicalRegister } from '@hakulex/vue-lexical'
import { mergeRegister } from '@lexical/utils'
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from '@lucide/vue'
import {
  $addUpdateTag,
  $createParagraphNode,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $isParagraphNode,
  COMMAND_PRIORITY_HIGH,
  HISTORY_PUSH_TAG,
  KEY_DOWN_COMMAND,
} from 'lexical'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { gapAfter } from './geometry'

const HIDE_DELAY = 300
const HANDLE_HEIGHT = 24
const HANDLE_WIDTH = 48
const GAP = 4

const editor = useLexicalComposer()
const editable = useLexicalEditable()
const theme = useEditorTheme()

const hoverKey = shallowRef<string | null>(null)
const open = shallowRef(false)
/** What the menu acts on stays fixed while it is open, wherever the pointer goes. */
const menuKey = shallowRef<string | null>(null)
const menu = shallowRef<{ canUp: boolean, canDown: boolean, type: BlockType | null, turnable: boolean } | null>(null)
const dragKey = shallowRef<string | null>(null)
const position = shallowRef<CSSProperties | null>(null)
const lineStyle = shallowRef<CSSProperties | null>(null)

const activeKey = computed(() => menuKey.value ?? hoverKey.value)
const visible = computed(() => editable.value && activeKey.value !== null && position.value !== null)

/* Which block */

/** The top-level element holding `target`. */
function topLevelElement(target: EventTarget | null): HTMLElement | null {
  const root = editor.getRootElement()
  if (!root || !(target instanceof Element))
    return null
  let current: Element | null = target
  while (current && current !== root) {
    if (current.parentElement === root)
      return current as HTMLElement
    current = current.parentElement
  }
  return null
}

/** The key of a block that can have a handle. Lexical's caret anchors and footnotes can't. */
function blockKeyOf(element: HTMLElement): string | null {
  if (element.hasAttribute('data-lexical-decorator-boundary'))
    return null
  return editor.read(() => {
    const node = $getNearestNodeFromDOMNode(element)
    return node && !$isFootnoteSectionNode(node)
      ? node.getKey()
      : null
  })
}

/* Where */

/*
 * The block the handle is beside carries data-hlx-handle, so what sits in the same place (a
 * heading's level badge) can give way. Only on the page: Lexical drops it if it remakes the
 * element, and the next measure puts it back.
 */
let marked: HTMLElement | null = null
function mark(element: HTMLElement | null) {
  if (marked === element)
    return
  marked?.removeAttribute('data-hlx-handle')
  marked = element
  marked?.setAttribute('data-hlx-handle', '')
}

function measure() {
  const key = activeKey.value
  const element = key
    ? editor.getElementByKey(key)
    : null
  const root = editor.getRootElement()
  mark(element && root
    ? element
    : null)
  if (!element || !root) {
    position.value = null
    return
  }
  const box = element.getBoundingClientRect()
  const line = Number.parseFloat(getComputedStyle(element).lineHeight)
  const firstLine = Number.isFinite(line)
    ? Math.min(line, box.height || line)
    : HANDLE_HEIGHT
  position.value = {
    left: `${Math.max(GAP, root.getBoundingClientRect().left - HANDLE_WIDTH - GAP)}px`,
    // A table's own row handles sit beside its rows, so this one goes above them.
    top: `${element.querySelector('table')
      ? box.top - HANDLE_HEIGHT
      : box.top + (firstLine - HANDLE_HEIGHT) / 2}px`,
  }
}

watch(activeKey, measure)
watch(editable, (value) => {
  if (!value) {
    hoverKey.value = null
    menuKey.value = null
    open.value = false
  }
})

/* Showing and hiding */

let hideTimer: ReturnType<typeof setTimeout> | undefined

function keepShown() {
  clearTimeout(hideTimer)
}

function hideSoon() {
  clearTimeout(hideTimer)
  // Mid-drag the handle is what's being dragged: removing it could end the drag.
  if (dragKey.value)
    return
  // Long enough for the pointer to cross over to the handle.
  hideTimer = setTimeout(() => {
    hoverKey.value = null
  }, HIDE_DELAY)
}

function onMouseMove(event: MouseEvent) {
  if (!editor.isEditable() || dragKey.value)
    return
  const element = topLevelElement(event.target)
  const key = element
    ? blockKeyOf(element)
    : null
  keepShown()
  if (key)
    hoverKey.value = key
  else
    hideSoon()
}

onMounted(() => {
  window.addEventListener('scroll', measure, true)
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => {
  clearTimeout(hideTimer)
  mark(null)
  window.removeEventListener('scroll', measure, true)
  window.removeEventListener('resize', measure)
  stopDragging()
})

/* The menu */

function focusEditor() {
  editor.focus()
}

function onMenuOpen(value: boolean) {
  open.value = value
  if (!value) {
    menuKey.value = null
    return
  }
  const key = hoverKey.value
  menuKey.value = key
  if (!key)
    return
  menu.value = editor.getEditorState().read(() => {
    const node = $getNodeByKey(key)
    return {
      canUp: $canMoveBlock(key, 'up'),
      canDown: $canMoveBlock(key, 'down'),
      type: node
        ? $getBlockType(node)
        : null,
      turnable: !!node && $canTurnBlock(node),
    }
  })
}

function act(action: (key: string) => void) {
  const key = menuKey.value
  if (!key)
    return
  editor.update(() => action(key), { onUpdate: measure })
}

/** Opened on click, not on the press Reka listens for, so that a press can start a drag. */
function onGripClick() {
  onMenuOpen(true)
}

/* Adding a line */

function addLine() {
  const key = hoverKey.value
  if (!key)
    return
  editor.update(() => {
    const block = $getNodeByKey(key)
    if (!block)
      return
    const next = block.getNextSibling()
    const blank = [block, next].find(node => $isParagraphNode(node) && node.isEmpty())
    if ($isParagraphNode(blank)) {
      blank.select()
    }
    else {
      $addUpdateTag(HISTORY_PUSH_TAG)
      const line = $createParagraphNode()
      block.insertAfter(line)
      line.select()
    }
  })
  focusEditor()
}

/* Dragging. Whether it's ours is known from here, not from the drag's data. */

function movableBoxes() {
  const root = editor.getRootElement()
  if (!root)
    return []
  return [...root.children].flatMap((child) => {
    const key = blockKeyOf(child as HTMLElement)
    if (!key)
      return []
    const { top, bottom } = child.getBoundingClientRect()
    return [
      { key, top, bottom },
    ]
  })
}

function insideRoot(event: DragEvent) {
  const box = editor.getRootElement()?.getBoundingClientRect()
  return !!box && event.clientY >= box.top && event.clientY <= box.bottom
}

function onDragOver(event: DragEvent) {
  if (!dragKey.value)
    return
  const root = editor.getRootElement()
  if (!root || !insideRoot(event)) {
    lineStyle.value = null
    return
  }
  event.preventDefault()
  if (event.dataTransfer)
    event.dataTransfer.dropEffect = 'move'
  const gap = gapAfter(movableBoxes(), event.clientY)
  const box = root.getBoundingClientRect()
  lineStyle.value = {
    left: `${box.left}px`,
    top: `${gap.y - 1}px`,
    width: `${box.width}px`,
  }
}

function onDrop(event: DragEvent) {
  const key = dragKey.value
  if (!key)
    return
  // Ours, so it isn't text for Lexical or a file for the upload plugins.
  event.preventDefault()
  event.stopPropagation()
  // From where it was let go: browsers don't all send a last dragover for that spot.
  const inside = insideRoot(event)
  const gap = gapAfter(movableBoxes(), event.clientY)
  stopDragging()
  if (inside)
    editor.update(() => $moveBlockAfter(key, gap.after))
}

function stopDragging() {
  dragKey.value = null
  lineStyle.value = null
  document.removeEventListener('dragover', onDragOver, true)
  document.removeEventListener('drop', onDrop, true)
  document.removeEventListener('dragend', stopDragging, true)
}

function onDragStart(event: DragEvent) {
  const key = hoverKey.value
  if (!key)
    return
  dragKey.value = key
  const transfer = event.dataTransfer
  if (transfer) {
    transfer.effectAllowed = 'move'
    // Firefox won't start a drag without data.
    transfer.setData('text/plain', '')
    const element = editor.getElementByKey(key)
    if (element)
      transfer.setDragImage(element, 0, 0)
  }
  document.addEventListener('dragover', onDragOver, true)
  document.addEventListener('drop', onDrop, true)
  document.addEventListener('dragend', stopDragging, true)
}

/* Listening */

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

useLexicalRegister(editor => mergeRegister(
  editor.registerRootListener((root, previous) => {
    previous?.removeEventListener('mousemove', onMouseMove)
    previous?.removeEventListener('mouseleave', hideSoon)
    root?.addEventListener('mousemove', onMouseMove)
    root?.addEventListener('mouseleave', hideSoon)
  }),
  editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
    if (dirtyElements.size || dirtyLeaves.size)
      measure()
  }),
  editor.registerCommand(KEY_DOWN_COMMAND, (event) => {
    if (!editor.isEditable() || event.altKey || !(isMac
      ? event.metaKey && !event.ctrlKey
      : event.ctrlKey && !event.metaKey)) {
      return false
    }
    // Inputs and code editors inside blocks have their own idea of these keys.
    if (event.target !== editor.getRootElement())
      return false
    const key = event.key.toLowerCase()
    const direction = event.shiftKey
      ? { arrowup: 'up', arrowdown: 'down' }[key] as 'up' | 'down' | undefined
      : undefined
    const duplicate = !event.shiftKey && key === 'd'
    if (!direction && !duplicate)
      return false
    event.preventDefault()
    const keys = $selectionBlockKeys()
    if (direction)
      $moveBlocks(keys, direction)
    else
      $duplicateBlocks(keys)
    return true
  }, COMMAND_PRIORITY_HIGH),
))

function turnInto(type: unknown) {
  act(key => $turnBlocksInto([key], type as BlockType))
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="hlx-root hlx-block-handle"
      :data-variant="theme.variant"
      :data-color-scheme="theme.colorScheme"
      :style="[theme.style, position!]"
      @mouseenter="keepShown"
      @mouseleave="hideSoon"
    >
      <button
        type="button"
        class="hlx-block-add"
        aria-label="在下方新增段落"
        title="在下方新增段落"
        @mousedown.prevent
        @click="addLine"
      >
        <Plus :size="16" :stroke-width="2" />
      </button>
      <DropdownMenuRoot :open="open" @update:open="onMenuOpen">
        <span class="hlx-block-grip-wrap" @pointerdown.capture.stop>
          <DropdownMenuTrigger as-child>
            <button
              type="button"
              class="hlx-block-grip"
              aria-label="區塊操作，可拖曳移動"
              title="拖曳移動，或按下開啟選單"
              draggable="true"
              @click="onGripClick"
              @dragstart="onDragStart"
            >
              <GripVertical :size="16" :stroke-width="2" />
            </button>
          </DropdownMenuTrigger>
        </span>
        <DropdownMenuPortal>
          <DropdownMenuContent
            class="hlx-root hlx-block-menu"
            :data-variant="theme.variant"
            :data-color-scheme="theme.colorScheme"
            :style="theme.style"
            side="right"
            align="start"
            :side-offset="4"
            @close-auto-focus.prevent="focusEditor"
          >
            <DropdownMenuItem class="hlx-block-menu-item" :disabled="!menu?.canUp" @select="act(key => $moveBlocks([key], 'up'))">
              <ArrowUp :size="14" /> 上移
            </DropdownMenuItem>
            <DropdownMenuItem class="hlx-block-menu-item" :disabled="!menu?.canDown" @select="act(key => $moveBlocks([key], 'down'))">
              <ArrowDown :size="14" /> 下移
            </DropdownMenuItem>
            <DropdownMenuItem class="hlx-block-menu-item" @select="act(key => $duplicateBlocks([key]))">
              <Copy :size="14" /> 複製
            </DropdownMenuItem>
            <template v-if="menu?.turnable">
              <DropdownMenuSeparator class="hlx-block-menu-separator" />
              <DropdownMenuRadioGroup :model-value="menu.type ?? undefined" @update:model-value="turnInto">
                <DropdownMenuRadioItem
                  v-for="item in TURNABLE_BLOCK_TYPES"
                  :key="item.type"
                  class="hlx-block-menu-item"
                  :value="item.type"
                >
                  {{ item.label }}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </template>
            <DropdownMenuSeparator class="hlx-block-menu-separator" />
            <DropdownMenuItem class="hlx-block-menu-item" data-destructive @select="act($deleteBlock)">
              <Trash2 :size="14" /> 刪除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </div>
    <div
      v-if="lineStyle"
      class="hlx-root hlx-block-drop-line"
      :data-variant="theme.variant"
      :data-color-scheme="theme.colorScheme"
      :style="[theme.style, lineStyle]"
    />
  </Teleport>
</template>
