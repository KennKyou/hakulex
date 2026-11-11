<script setup lang="ts">
/* A group of settings in the panel. */
defineProps<{ title: string }>()
</script>

<template>
  <section class="inspector-section">
    <h2>{{ title }}</h2>
    <slot />
  </section>
</template>

<style scoped>
.inspector-section {
  padding: 16px;
  border-bottom: 1px solid var(--hlx-color-border);
}

h2 {
  margin: 0 0 10px;
  color: var(--hlx-color-text-tertiary);
  font-size: 12px;
  font-weight: 500;
}
</style>
