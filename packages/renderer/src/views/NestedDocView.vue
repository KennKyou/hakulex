<script setup lang="ts">
defineProps<{
  /** Long enough to start out cut short. The whole of it stays in the HTML. */
  collapsible: boolean
}>()

defineSlots<{ default?: () => unknown }>()

/** Open in full. Its own unless bound, as the editor does to open it when the caret goes in. */
const expanded = defineModel<boolean>('expanded', { default: false })
</script>

<template>
  <div class="hlx-nested-doc" :data-collapsed="collapsible && !expanded ? '' : undefined">
    <div class="hlx-nested-doc-body">
      <slot />
      <div v-if="collapsible && !expanded" class="hlx-nested-doc-fade" aria-hidden="true" />
    </div>
    <button
      v-if="collapsible"
      type="button"
      class="hlx-nested-doc-toggle"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      {{ expanded ? '收合' : '展開全文' }}
    </button>
  </div>
</template>
