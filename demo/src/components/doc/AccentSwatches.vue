<script setup lang="ts">
import type { ColorScheme } from '@hakulex/style-token'
import { ACCENTS } from '../../site/accents'

/* A row of accent colors to pick from, "預設" first; a slot can add more at the end. */
defineProps<{ scheme: ColorScheme }>()
const chosen = defineModel<string>({ required: true })
</script>

<template>
  <div class="accent-swatches" role="radiogroup" aria-label="強調色">
    <button
      type="button"
      role="radio"
      class="accent-swatch accent-default"
      :aria-checked="chosen === ''"
      aria-label="預設"
      title="預設"
      @click="chosen = ''"
    />
    <button
      v-for="accent in ACCENTS"
      :key="accent.id"
      type="button"
      role="radio"
      class="accent-swatch"
      :aria-checked="chosen === accent.id"
      :aria-label="accent.label"
      :title="accent.label"
      :style="{ background: accent[scheme] }"
      @click="chosen = accent.id"
    />
    <slot />
  </div>
</template>

<style scoped>
.accent-swatches {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.accent-swatch {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
}

/* The default accent, split with the page's own background: "nothing set". */
.accent-default {
  background: linear-gradient(135deg, var(--hlx-color-accent) 50%, var(--hlx-color-bg) 50%);
  box-shadow: inset 0 0 0 1px var(--hlx-color-border);
}

.accent-swatch[aria-checked='true'] {
  outline: 2px solid var(--hlx-color-text);
  outline-offset: 2px;
}

.accent-swatch:focus-visible {
  outline: 2px solid var(--hlx-color-accent);
  outline-offset: 2px;
}
</style>
