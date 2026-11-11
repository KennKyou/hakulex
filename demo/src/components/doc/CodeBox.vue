<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

/* Text to read and copy, such as a document's JSON. */
const props = defineProps<{ label: string, value: string }>()

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
async function copy() {
  await navigator.clipboard.writeText(props.value)
  copied.value = true
  clearTimeout(timer)
  timer = setTimeout(() => copied.value = false, 1500)
}
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="codebox">
    <div class="codebox-head">
      {{ label }}
      <button type="button" @click="copy">
        {{ copied ? '已複製' : '複製' }}
      </button>
    </div>
    <pre tabindex="0">{{ value }}</pre>
  </div>
</template>

<style scoped>
.codebox {
  overflow: hidden;
  border: 1px solid var(--hlx-color-border);
  border-radius: 10px;
}

.codebox-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  padding: 0 8px 0 14px;
  border-bottom: 1px solid var(--hlx-color-border);
  color: var(--hlx-color-text-tertiary);
  font-family: var(--hlx-font-mono);
  font-size: 12px;
}

button {
  height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--hlx-color-text-secondary);
  font: inherit;
  cursor: pointer;
}

button:hover {
  background: var(--hlx-color-fill-secondary);
}

pre {
  max-height: 360px;
  margin: 0;
  padding: 14px;
  overflow: auto;
  color: var(--hlx-color-text);
  font-family: var(--hlx-font-mono);
  font-size: 12.5px;
  line-height: 1.6;
}
</style>
