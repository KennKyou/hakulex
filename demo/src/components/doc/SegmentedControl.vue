<script setup lang="ts" generic="T extends string">
import { ref } from 'vue'

/* A choice of a few values, as one row of buttons. */
const props = defineProps<{
  label: string
  options: { value: T, label: string, count?: number }[]
}>()
const value = defineModel<T>({ required: true })

const buttons = ref<HTMLButtonElement[]>([])

function move(event: KeyboardEvent, index: number, by: number) {
  event.preventDefault()
  const next = (index + by + props.options.length) % props.options.length
  value.value = props.options[next].value
  buttons.value[next]?.focus()
}
</script>

<template>
  <div class="segmented" role="radiogroup" :aria-label="label">
    <button
      v-for="(option, index) in options"
      :key="option.value"
      ref="buttons"
      type="button"
      role="radio"
      :aria-checked="value === option.value"
      :tabindex="value === option.value ? 0 : -1"
      @click="value = option.value"
      @keydown.right="move($event, index, 1)"
      @keydown.down="move($event, index, 1)"
      @keydown.left="move($event, index, -1)"
      @keydown.up="move($event, index, -1)"
    >
      {{ option.label }}
      <span v-if="option.count !== undefined">{{ option.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.segmented {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--hlx-color-border);
  border-radius: 8px;
}

button {
  height: 26px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--hlx-color-text-tertiary);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

button:hover {
  color: var(--hlx-color-text);
}

button[aria-checked='true'] {
  background: var(--hlx-color-fill);
  color: var(--hlx-color-text);
  font-weight: 500;
}

button span {
  margin-left: 2px;
  color: var(--hlx-color-text-tertiary);
  font-size: 12px;
  font-weight: 400;
}
</style>
