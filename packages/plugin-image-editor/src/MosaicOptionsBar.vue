<script setup lang="ts">
import type { MosaicMode } from './mosaic'
import { Undo2 } from '@lucide/vue'
import { MOSAIC_STRENGTH_RANGE } from './mosaic'

/** The mosaic's options: pixelate or blur, how strong, undo. */
defineProps<{ mode: MosaicMode, strength: number, canUndo: boolean }>()
const emit = defineEmits<{
  mode: [mode: MosaicMode]
  strength: [strength: number]
  undo: []
}>()

const MODES: { id: MosaicMode, label: string }[] = [
  { id: 'pixelate', label: '像素化' },
  { id: 'blur', label: '模糊' },
]
</script>

<template>
  <div class="hlx-picture-editor-options">
    <button
      v-for="item in MODES"
      :key="item.id"
      type="button"
      class="hlx-picture-editor-segment"
      :aria-pressed="mode === item.id"
      @click="emit('mode', item.id)"
    >
      {{ item.label }}
    </button>
    <div class="hlx-picture-editor-options-divider" />
    <label class="hlx-picture-editor-range">
      {{ mode === 'blur' ? '模糊半徑' : '區塊大小' }}
      <input
        type="range"
        :min="MOSAIC_STRENGTH_RANGE[mode].min"
        :max="MOSAIC_STRENGTH_RANGE[mode].max"
        :value="strength"
        @input="emit('strength', Number(($event.target as HTMLInputElement).value))"
      >
      <span class="hlx-picture-editor-range-value">{{ strength }} px</span>
    </label>
    <div class="hlx-picture-editor-options-divider" />
    <button type="button" class="hlx-picture-editor-option" aria-label="復原" title="復原" :disabled="!canUndo" @click="emit('undo')">
      <Undo2 :size="16" aria-hidden="true" />
    </button>
  </div>
</template>
