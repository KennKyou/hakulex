<script setup lang="ts">
import type { Component } from 'vue'
import { nextTick, onMounted, useTemplateRef } from 'vue'
import { useEditorTheme } from '../theme-context'

// A class or style given to the panel is for the panel, not the Teleport around it.
defineOptions({ inheritAttrs: false })
const props = defineProps<{
  title: string
  icon?: Component
  /** The site's own dialog is over the panel, as while `pickImages` runs: its Esc isn't ours. */
  away?: boolean
}>()
const emit = defineEmits<{ close: [], revert: [] }>()
const theme = useEditorTheme()
const root = useTemplateRef<HTMLElement>('root')
defineExpose({ element: root })

// The field marked `data-autofocus` takes the keyboard, else the first; `data-select` selects its text.
onMounted(async () => {
  await nextTick()
  const field = root.value?.querySelector<HTMLInputElement>('[data-autofocus]')
    ?? root.value?.querySelector<HTMLInputElement>('input:not([type="hidden"]):not([disabled]), select, textarea')
  field?.focus({ preventScroll: true })
  if (field?.hasAttribute('data-select'))
    field.select()
})

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.isComposing || props.away)
    return
  event.preventDefault()
  event.stopPropagation()
  emit('revert')
}
</script>

<!--
  Beside the block, over the page. Each change is written as it is made; Esc puts it all back.
  It wears the chart panel's classes, so the two look the same.
-->
<template>
  <Teleport to="body">
    <div
      ref="root"
      v-bind="$attrs"
      class="hlx-root hlx-chart-popover hlx-block-panel"
      role="dialog"
      :aria-label="title"
      :data-variant="theme.variant"
      :data-color-scheme="theme.colorScheme"
      :style="theme.style"
      @keydown="onKeydown"
    >
      <div class="hlx-chart-panel">
        <div class="hlx-chart-panel-head">
          <component :is="icon" v-if="icon" />
          <span class="hlx-chart-panel-title">{{ title }}</span>
        </div>
        <div class="hlx-chart-panel-body hlx-chart-form">
          <slot />
        </div>
        <div class="hlx-block-panel-foot">
          改了就會套用 · Esc 還原
        </div>
      </div>
    </div>
  </Teleport>
</template>
