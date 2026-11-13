<script setup lang="ts">
import type { ImageData } from '../image/types'
import { ImageView, normalizeDisplayWidth, normalizeImageLayout } from '@hakulex/renderer'
import { useLexicalComposer, useLexicalEditable, useLexicalNodeSelection } from '@hakulex/vue-lexical'
import { $addUpdateTag, $getNodeByKey, HISTORY_PUSH_TAG } from 'lexical'
import { computed, h, inject, nextTick, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'
import { EditorCoreKey } from '../editor-core-key'
import { useBlockPanel } from '../media/live-edit'
import { $isImageNode } from '../nodes/ImageNode'
import BlockPanel from './BlockPanel.vue'
import BlockToolbar from './BlockToolbar.vue'
import ImagePanel from './ImagePanel.vue'

const props = defineProps<{
  nodeKey: string
  src: string
  altText: string
  width?: number
  height?: number
  caption?: string
  displayWidth?: number
  layout?: unknown
}>()

const editor = useLexicalComposer()
const editable = useLexicalEditable()
const { isSelected, setSelected, clearSelection } = useLexicalNodeSelection(props.nodeKey)
const selected = computed(() => editable.value && isSelected.value)
const root = useTemplateRef<HTMLElement>('root')

function onClick() {
  if (!editable.value)
    return
  clearSelection()
  setSelected(true)
}

/* Edited in a panel beside it: each change goes in as it is made. */

const core = inject(EditorCoreKey, null)
const upload = core?.uploadImage()
const pickImages = core?.pickImages()
/** The site's dialog from `pickImages` is over the panel. */
const away = shallowRef(false)
const {
  open,
  showToolbar,
  toolbarStyle,
  panelStyle,
  editAction,
  close,
  onDblclick,
  write,
  endTyping,
} = useBlockPanel<ImageData>(props.nodeKey, root, selected, editable, {
  $read: node => ($isImageNode(node)
    ? node.getData()
    : null),
  $write: (node, data) => {
    if ($isImageNode(node))
      node.setData(data)
  },
}, {
  toolbar: useTemplateRef('blockToolbar'),
  panel: useTemplateRef('blockPanel'),
  away,
})
// A panel that closed while choosing has nothing over it any more.
watch(open, (now) => {
  if (!now)
    away.value = false
})
function current() {
  return editor.getEditorState().read(() => {
    const node = $getNodeByKey(props.nodeKey)
    return $isImageNode(node)
      ? node.getData()
      : null
  })
}
function onWrite(patch: Partial<ImageData>, field?: string) {
  const data = current()
  if (data) {
    write({
      ...data,
      ...patch,
    }, field)
  }
}
const data = computed<ImageData>(() => ({
  src: props.src,
  altText: props.altText,
  width: props.width,
  height: props.height,
  caption: props.caption,
  displayWidth: props.displayWidth,
  layout: props.layout,
}))

function IconImage() {
  return h('svg', {
    'viewBox': '0 0 16 16',
    'fill': 'none',
    'stroke': 'currentColor',
    'stroke-width': 1.4,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  }, [
    h('rect', {
      x: 2.5,
      y: 3,
      width: 11,
      height: 10,
      rx: 1.5,
    }),
    h('circle', { cx: 6, cy: 6.5, r: 1 }),
    h('path', { d: 'M13.5 10.5l-3-3L4 13' }),
  ])
}

/* Resizing: only the view changes while dragging, so undo sees a single edit. */

const MOVE_THRESHOLD = 3

const draft = shallowRef<number>()
const shownWidth = computed(() => draft.value ?? props.displayWidth)
const floating = computed(() => !!normalizeImageLayout(props.layout))
const block = () => root.value?.closest<HTMLElement>('.hlx-image-block') ?? null

// A floating image's width is on the block, which the node looks after once there's an edit.
watch(draft, (value) => {
  if (!floating.value)
    return
  const width = value ?? props.displayWidth
  if (width)
    block()?.style.setProperty('--hlx-image-width', `${width}%`)
  else
    block()?.style.removeProperty('--hlx-image-width')
})
const box = shallowRef<{ left: number, right: number, top: number, height: number } | null>(null)

const image = () => root.value?.querySelector('img.hlx-image') ?? null

function measure() {
  const element = image()
  if (!root.value || !element) {
    box.value = null
    return
  }
  const outer = root.value.getBoundingClientRect()
  const inner = element.getBoundingClientRect()
  box.value = {
    left: inner.left - outer.left,
    right: inner.right - outer.left,
    top: inner.top - outer.top,
    height: inner.height,
  }
}

let observer: ResizeObserver | undefined
watch([
  selected,
  shownWidth,
  () => props.src,
  () => props.caption,
], async () => {
  observer?.disconnect()
  await nextTick()
  const element = image()
  if (!selected.value || !element)
    return
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure)
    observer.observe(element)
  }
}, { immediate: true })

let stopDrag: (() => void) | undefined
onBeforeUnmount(() => {
  stopDrag?.()
  observer?.disconnect()
})

function startResize(event: PointerEvent, side: 'left' | 'right') {
  const element = image()
  const available = (floating.value
    ? block()?.parentElement
    : root.value)?.getBoundingClientRect().width
  if (event.button !== 0 || !element || !available)
    return
  event.preventDefault()
  const startX = event.clientX
  const startWidth = element.getBoundingClientRect().width
  let moved = false

  const onMove = (move: PointerEvent) => {
    const delta = move.clientX - startX
    moved ||= Math.abs(delta) >= MOVE_THRESHOLD
    if (!moved)
      return
    // A centered image grows on both sides, so one moving 1px changes the width by 2px.
    const grown = startWidth + delta * (floating.value ? 1 : 2) * (side === 'right'
      ? 1
      : -1)
    draft.value = normalizeDisplayWidth(grown / available * 100)
  }
  const finish = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', onKey, true)
    stopDrag = undefined
  }
  function cancel() {
    finish()
    draft.value = undefined
  }
  function onUp() {
    finish()
    const value = draft.value
    if (value === undefined)
      return
    editor.update(() => {
      $addUpdateTag(HISTORY_PUSH_TAG)
      const node = $getNodeByKey(props.nodeKey)
      if ($isImageNode(node))
        node.setDisplayWidth(value)
    }, {
      onUpdate: () => {
        draft.value = undefined
      },
    })
  }
  function onKey(key: KeyboardEvent) {
    if (key.key !== 'Escape')
      return
    key.preventDefault()
    key.stopPropagation()
    cancel()
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('keydown', onKey, true)
  stopDrag = finish
}
</script>

<template>
  <div ref="root" class="hlx-image-editor" :data-selected="selected || undefined" @click="onClick" @dblclick="onDblclick">
    <ImageView
      :src="src"
      :alt-text="altText"
      :width="width"
      :height="height"
      :caption="caption"
      :display-width="floating ? undefined : shownWidth"
    />
    <template v-if="selected && box">
      <span
        class="hlx-image-resize"
        data-side="left"
        :style="{ left: `${box.left - 6}px`, top: `${box.top}px`, height: `${box.height}px` }"
        @pointerdown.stop="startResize($event, 'left')"
        @mousedown.prevent.stop
        @click.stop
      />
      <span
        class="hlx-image-resize"
        data-side="right"
        :style="{ left: `${box.right - 6}px`, top: `${box.top}px`, height: `${box.height}px` }"
        @pointerdown.stop="startResize($event, 'right')"
        @mousedown.prevent.stop
        @click.stop
      />
    </template>
  </div>
  <BlockToolbar v-if="showToolbar" ref="blockToolbar" label="圖片" :actions="[editAction]" :style="toolbarStyle" />
  <BlockPanel
    v-if="open"
    ref="blockPanel"
    title="圖片"
    :icon="IconImage"
    :style="panelStyle"
    :away="away"
    @close="close('keep')"
    @revert="close('revert')"
  >
    <ImagePanel
      :data="data"
      :upload="upload"
      :pick-images="pickImages"
      :pick-label="core?.pickImagesLabel()"
      :allow-url="core?.allowImageUrl() ?? true"
      @write="onWrite"
      @end-typing="endTyping"
      @away="away = $event"
    />
  </BlockPanel>
</template>
