<script setup lang="ts">
import type { Component } from 'vue'
import { useTemplateRef } from 'vue'
import { useEditorTheme } from '../theme-context'

/** One button on a block's toolbar. */
export interface BlockToolbarAction {
  id: string
  label: string
  icon?: Component
  /** For a switch, such as the chart's data view. */
  pressed?: boolean
  /** For a button that opens a panel. */
  expanded?: boolean
  onSelect: () => void
}

// A class or style given to the toolbar is for the toolbar, not the Teleport around it.
defineOptions({ inheritAttrs: false })
defineProps<{ label: string, actions: BlockToolbarAction[] }>()
const theme = useEditorTheme()
const root = useTemplateRef<HTMLElement>('root')
defineExpose({ element: root })
</script>

<!--
  Over the page, at the block's top right while it is picked. A press on a button keeps the
  editor's selection, so the block stays picked.
-->
<template>
  <Teleport to="body">
    <div
      ref="root"
      v-bind="$attrs"
      class="hlx-root hlx-block-toolbar"
      role="toolbar"
      :aria-label="label"
      :data-variant="theme.variant"
      :data-color-scheme="theme.colorScheme"
      :style="theme.style"
    >
      <button
        v-for="action in actions"
        :key="action.id"
        type="button"
        :data-action="action.id"
        :aria-pressed="action.pressed"
        :aria-expanded="action.expanded"
        @mousedown.prevent
        @click="action.onSelect()"
      >
        <component :is="action.icon" v-if="action.icon" />{{ action.label }}
      </button>
    </div>
  </Teleport>
</template>
