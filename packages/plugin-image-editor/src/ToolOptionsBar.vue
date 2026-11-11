<script setup lang="ts">
import { Redo2, Undo2 } from '@lucide/vue'
import { STROKE_WIDTHS, SWATCH_COLORS } from './annotation'

/** The marks' options: color, width for drawn lines, undo, redo. */
defineProps<{
  strokeColor: string
  strokeWidth: number
  showStrokeWidth: boolean
  canUndo: boolean
  canRedo: boolean
}>()
const emit = defineEmits<{
  color: [color: string]
  width: [width: number]
  undo: []
  redo: []
}>()
</script>

<template>
  <div class="hlx-picture-editor-options">
    <button
      v-for="color in SWATCH_COLORS"
      :key="color"
      type="button"
      class="hlx-picture-editor-swatch"
      :aria-label="`顏色 ${color}`"
      :title="color"
      :aria-pressed="strokeColor === color"
      :style="{ backgroundColor: color }"
      @click="emit('color', color)"
    />
    <template v-if="showStrokeWidth">
      <div class="hlx-picture-editor-options-divider" />
      <button
        v-for="width in STROKE_WIDTHS"
        :key="width"
        type="button"
        class="hlx-picture-editor-option"
        :aria-label="`粗細 ${width}`"
        :title="`粗細 ${width} px`"
        :aria-pressed="strokeWidth === width"
        @click="emit('width', width)"
      >
        <span class="hlx-picture-editor-stroke-dot" :style="{ width: `${width + 4}px`, height: `${width + 4}px` }" />
      </button>
    </template>
    <div class="hlx-picture-editor-options-divider" />
    <button type="button" class="hlx-picture-editor-option" aria-label="復原" title="復原" :disabled="!canUndo" @click="emit('undo')">
      <Undo2 :size="16" aria-hidden="true" />
    </button>
    <button type="button" class="hlx-picture-editor-option" aria-label="重做" title="重做" :disabled="!canRedo" @click="emit('redo')">
      <Redo2 :size="16" aria-hidden="true" />
    </button>
  </div>
</template>
