<script setup lang="ts">
import type { SizeMode } from './editor-state'
import type { ImageSize } from './resize'
import { computed } from 'vue'
import { canShrinkTo, LONG_EDGE_PRESETS, scaleToLongEdge } from './resize'

/** The output's long edge: the original, a preset or a number. */
const props = defineProps<{
  size: ImageSize | null
  mode: SizeMode
  maxLongEdge: number | null
  customEdge: string
}>()
const emit = defineEmits<{
  mode: [mode: SizeMode, edge: number | null]
  customEdge: [value: string]
}>()

const output = computed(() => (props.size && props.maxLongEdge !== null
  ? scaleToLongEdge(props.size, props.maxLongEdge)
  : props.size))
const selectValue = computed(() => (props.mode === 'preset'
  ? String(props.maxLongEdge)
  : props.mode))

function onChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value === 'original')
    emit('mode', 'original', null)
  else if (value === 'custom')
    emit('mode', 'custom', null)
  else
    emit('mode', 'preset', Number(value))
}
</script>

<template>
  <div class="hlx-picture-editor-size">
    <label class="hlx-picture-editor-range">
      輸出長邊
      <select :value="selectValue" :disabled="!size" @change="onChange">
        <option value="original">原尺寸</option>
        <option
          v-for="edge in LONG_EDGE_PRESETS"
          :key="edge"
          :value="String(edge)"
          :disabled="!size || !canShrinkTo(size, edge)"
        >
          {{ edge }} px
        </option>
        <option value="custom">自訂…</option>
      </select>
    </label>
    <input
      v-if="mode === 'custom'"
      aria-label="自訂長邊（像素）"
      inputmode="numeric"
      placeholder="1600"
      :value="customEdge"
      @input="emit('customEdge', ($event.target as HTMLInputElement).value = ($event.target as HTMLInputElement).value.replaceAll(/\D/g, ''))"
    >
    <span v-if="output" class="hlx-picture-editor-size-output">→ {{ output.width }} × {{ output.height }}</span>
  </div>
</template>
