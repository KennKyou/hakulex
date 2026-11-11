<script setup lang="ts">
import type { AnnotationState, MarkerBaseEditor } from '@markerjs/markerjs3'
import type { AnnotationTool } from './annotation'
import { MarkerArea, TextMarkerEditor } from '@markerjs/markerjs3'
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { MARKER_TYPE_BY_TOOL } from './annotation'

/*
 * marker.js's MarkerArea over the picture: after each mark the
 * next of the same kind is ready, in the color and width picked. The marks are kept by the
 * screen, so they survive switching tools.
 */
const props = defineProps<{
  sourceUrl: string
  tool: AnnotationTool
  strokeColor: string
  strokeWidth: number
  /** The marks to start with, kept by the screen. */
  state: AnnotationState | null
  /** The next counter's number, kept by the screen. */
  counter: number
}>()
const emit = defineEmits<{
  history: [canUndo: boolean, canRedo: boolean]
  /** The marks now, for the screen to keep. */
  state: [state: AnnotationState]
  /** A counter was placed: the next one takes the following number. */
  counted: []
  decodeError: []
}>()

const TEXT_TOOLS = new Set<AnnotationTool>(['counter', 'text'])

const container = useTemplateRef<HTMLElement>('container')
let area: MarkerArea | null = null
const ready = shallowRef(false)
let disposed = false

function styleEditor(editor: MarkerBaseEditor, isNew: boolean) {
  if (props.tool === 'cover') {
    editor.fillColor = props.strokeColor
  }
  else if (editor.is(TextMarkerEditor)) {
    editor.color = props.strokeColor
    if (isNew && props.tool === 'counter')
      editor.marker.text = String(props.counter)
  }
  else {
    editor.strokeColor = props.strokeColor
    editor.strokeWidth = props.strokeWidth
  }
}

/** Gets the next mark ready. */
function arm() {
  if (!area)
    return
  const editor = area.createMarker(MARKER_TYPE_BY_TOOL[props.tool])
  if (editor)
    styleEditor(editor, true)
}

function sync() {
  if (!area)
    return
  emit('state', area.getState())
  emit('history', area.isUndoPossible, area.isRedoPossible)
}

/*
 * Getting a mark ready while the pointer is down breaks marker.js: it sends the pointerup to
 * the new editor, whose mark has nothing drawn yet. So a ready that comes then waits for the
 * pointer to go up.
 */
let pointerActive = false
let armPending = false
function tryArm() {
  if (disposed || !area)
    return
  if (area.currentMarkerEditor || area.selectedMarkerEditors.length > 0)
    return
  if (pointerActive) {
    armPending = true
    return
  }
  arm()
}
function onPointerDown() {
  pointerActive = true
  if (area)
    fixFirstStep(area)
}
function onPointerRelease() {
  pointerActive = false
  if (!armPending)
    return
  armPending = false
  // marker.js's own pointerup has to finish first.
  setTimeout(tryArm, 0)
}

function onCreate() {
  if (props.tool === 'counter')
    emit('counted')
  sync()
  // Text and counters get the next ready once deselected: now would close their text editor.
  if (!TEXT_TOOLS.has(props.tool))
    arm()
}

function onDeselect() {
  if (TEXT_TOOLS.has(props.tool))
    setTimeout(tryArm, 0)
}

/*
 * marker.js records its first undo step when the area shows, before it knows the picture's size:
 * a 0 × 0 step. The first mark then replaces that step instead of following it, as its sizes
 * differ, so undo never becomes possible. So before the first
 * mark, once the size is known, that step is put right. marker.js has no way to do this of its
 * own: its manager is reached into, and left alone if it isn't there.
 */
function fixFirstStep(markerArea: MarkerArea) {
  const history = (markerArea as unknown as { undoRedoManager?: { undoStack?: { width?: number, height?: number }[] } }).undoRedoManager
  const steps = history?.undoStack
  if (!Array.isArray(steps) || steps.length !== 1)
    return
  const now = markerArea.getState()
  if (steps[0].width !== now.width || steps[0].height !== now.height)
    steps[0] = JSON.parse(JSON.stringify(now))
}

onMounted(() => {
  const host = container.value
  if (!host)
    return
  const markerArea = new MarkerArea()
  const img = document.createElement('img')
  img.crossOrigin = 'anonymous'
  img.src = props.sourceUrl
  host.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('pointerup', onPointerRelease)
  window.addEventListener('pointercancel', onPointerRelease)
  img.decode().then(() => {
    if (disposed)
      return
    markerArea.targetImage = img
    markerArea.autoZoomOut = true
    markerArea.addEventListener('markercreate', onCreate)
    markerArea.addEventListener('markerchange', sync)
    markerArea.addEventListener('markerdelete', sync)
    markerArea.addEventListener('areastatechange', sync)
    markerArea.addEventListener('markerdeselect', onDeselect)
    host.append(markerArea)
    area = markerArea
    if (props.state)
      markerArea.restoreState(props.state, false)
    ready.value = true
  }, () => {
    if (!disposed)
      emit('decodeError')
  })
})

onBeforeUnmount(() => {
  disposed = true
  container.value?.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('pointerup', onPointerRelease)
  window.removeEventListener('pointercancel', onPointerRelease)
  if (area) {
    emit('state', area.getState())
    area.remove()
    area = null
  }
  // Undo and redo wait for the next surface.
  emit('history', false, false)
})

watch([
  ready,
  () => props.tool,
], ([isReady]) => {
  if (isReady)
    arm()
})

watch(() => [props.strokeColor, props.strokeWidth], () => {
  if (!ready.value || !area)
    return
  for (const editor of area.selectedMarkerEditors)
    styleEditor(editor, false)
  sync()
  arm()
})

function undo() {
  if (!area)
    return
  area.undo()
  sync()
  arm()
}

function redo() {
  if (!area)
    return
  area.redo()
  sync()
  arm()
}

defineExpose({ undo, redo })
</script>

<template>
  <div ref="container" class="hlx-picture-editor-marks" />
</template>
