<script setup lang="ts">
/*
 * hakulex's mark: a white lark on a lake. The bird is drawn in the text's color on the page's
 * own background; the water takes the accent.
 */
withDefaults(defineProps<{ size?: number }>(), { size: 22 })
</script>

<template>
  <svg class="logo-mark" viewBox="0 0 48 48" :width="size" :height="size" fill="none" aria-hidden="true">
    <path d="M10 24c0-8 6-13 14-12l7-3-4 6c2 6-3 11-10 11-4 0-7-1-7-2Z" class="logo-mark-bird" stroke-width="3" stroke-linejoin="round" />
    <path d="M6 32h36M11 38h26M17 44h14" class="logo-mark-water" stroke-width="3" stroke-linecap="round" />
  </svg>
</template>

<style scoped>
.logo-mark {
  flex: none;
}

.logo-mark-bird {
  fill: var(--hlx-color-bg);
  stroke: var(--hlx-color-text);
}

.logo-mark-water {
  stroke: var(--hlx-color-accent);
}
</style>
