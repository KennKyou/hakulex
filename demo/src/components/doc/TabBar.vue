<script setup lang="ts" generic="T extends string">
/* Views of the same thing, underlined. */
defineProps<{
  label: string
  tabs: readonly { value: T, label: string }[]
}>()
const value = defineModel<T>({ required: true })
</script>

<template>
  <div class="tabbar" role="tablist" :aria-label="label">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      type="button"
      role="tab"
      :aria-selected="value === tab.value"
      @click="value = tab.value"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<style scoped>
.tabbar {
  display: flex;
  gap: 20px;
}

button {
  height: 40px;
  margin-bottom: -1px;
  padding: 0;
  border: 0;
  border-bottom: 1px solid transparent;
  background: transparent;
  color: var(--hlx-color-text-tertiary);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

button:hover {
  color: var(--hlx-color-text);
}

button[aria-selected='true'] {
  border-bottom-color: var(--hlx-color-text);
  color: var(--hlx-color-text);
  font-weight: 500;
}
</style>
