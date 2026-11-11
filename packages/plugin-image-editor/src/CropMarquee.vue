<script setup lang="ts">
import type { CropRect } from './crop'
import type { PercentCrop } from './editor-state'
import { onBeforeUnmount, useTemplateRef } from 'vue'

/*
 * A free selection over the picture, as react-image-crop does: drag a corner or an
 * edge to resize it, drag inside to move it, drag outside to draw a new one. It is kept in
 * percent of the picture shown; when a drag ends, it is also given in pixels shown.
 */
const props = defineProps<{
  /** `null` shows no selection. */
  crop: PercentCrop | null
  disabled?: boolean
}>()
const emit = defineEmits<{
  change: [crop: PercentCrop]
  complete: [pixels: CropRect]
}>()

const HANDLES = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
] as const
type Handle = typeof HANDLES[number]

const root = useTemplateRef<HTMLElement>('root')

interface Drag {
  kind: 'new' | 'move' | Handle
  bounds: DOMRect
  /** Where the pointer went down, in percent. */
  start: { x: number, y: number }
  from: PercentCrop
  last: PercentCrop
}
let drag: Drag | null = null

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

function percentAt(event: PointerEvent, bounds: DOMRect) {
  return {
    x: clamp(((event.clientX - bounds.left) * 100) / bounds.width, 0, 100),
    y: clamp(((event.clientY - bounds.top) * 100) / bounds.height, 0, 100),
  }
}

/** A box from two edges in any order. */
function box(left: number, top: number, right: number, bottom: number): PercentCrop {
  return {
    x: Math.min(left, right),
    y: Math.min(top, bottom),
    width: Math.abs(right - left),
    height: Math.abs(bottom - top),
  }
}

function next(current: Drag, point: { x: number, y: number }): PercentCrop {
  const { from, start } = current
  if (current.kind === 'new')
    return box(start.x, start.y, point.x, point.y)
  if (current.kind === 'move') {
    return {
      ...from,
      x: clamp(from.x + point.x - start.x, 0, 100 - from.width),
      y: clamp(from.y + point.y - start.y, 0, 100 - from.height),
    }
  }
  let left = from.x
  let top = from.y
  let right = from.x + from.width
  let bottom = from.y + from.height
  if (current.kind.includes('w'))
    left = point.x
  if (current.kind.includes('e'))
    right = point.x
  if (current.kind.includes('n'))
    top = point.y
  if (current.kind.includes('s'))
    bottom = point.y
  return box(left, top, right, bottom)
}

function onPointerDown(event: PointerEvent) {
  if (props.disabled || event.button !== 0 || !root.value)
    return
  event.preventDefault()
  const target = event.target as Element
  const handle = target.closest<HTMLElement>('[data-handle]')?.dataset.handle as Handle | undefined
  const inside = !!target.closest('.hlx-crop-selection') && !!props.crop?.width
  const bounds = root.value.getBoundingClientRect()
  const start = percentAt(event, bounds)
  const from = props.crop ?? {
    x: start.x,
    y: start.y,
    width: 0,
    height: 0,
  }
  drag = {
    kind: handle ?? (inside
      ? 'move'
      : 'new'),
    bounds,
    start,
    from,
    last: from,
  }
  document.addEventListener('pointermove', onPointerMove)
  document.addEventListener('pointerup', onPointerUp)
  document.addEventListener('pointercancel', onPointerUp)
}

function onPointerMove(event: PointerEvent) {
  if (!drag)
    return
  drag.last = next(drag, percentAt(event, drag.bounds))
  emit('change', drag.last)
}

function stop() {
  document.removeEventListener('pointermove', onPointerMove)
  document.removeEventListener('pointerup', onPointerUp)
  document.removeEventListener('pointercancel', onPointerUp)
}

function onPointerUp(event: PointerEvent) {
  const current = drag
  drag = null
  stop()
  if (!current)
    return
  const crop = event.type === 'pointerup'
    ? next(current, percentAt(event, current.bounds))
    : current.last
  emit('change', crop)
  const { width, height } = current.bounds
  emit('complete', {
    x: (crop.x * width) / 100,
    y: (crop.y * height) / 100,
    width: (crop.width * width) / 100,
    height: (crop.height * height) / 100,
  })
}

onBeforeUnmount(stop)
</script>

<template>
  <div
    ref="root"
    class="hlx-crop"
    :data-disabled="disabled ? '' : undefined"
    @pointerdown="onPointerDown"
  >
    <slot />
    <template v-if="crop && crop.width > 0 && crop.height > 0">
      <!-- The rest of the picture is dimmed, and only the picture. -->
      <div class="hlx-crop-shade" aria-hidden="true">
        <div :style="{ left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.width}%`, height: `${crop.height}%` }" />
      </div>
      <div
        class="hlx-crop-selection"
        :style="{ left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.width}%`, height: `${crop.height}%` }"
      >
        <span v-for="handle in HANDLES" :key="handle" class="hlx-crop-handle" :data-handle="handle" />
      </div>
    </template>
  </div>
</template>
