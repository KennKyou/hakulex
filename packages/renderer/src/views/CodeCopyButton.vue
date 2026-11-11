<script setup lang="ts">
import { onBeforeUnmount, shallowRef } from 'vue'

/* The copy button code blocks and code snippets share: Lucide's copy icon, and its check once copied (ISC). */
const props = defineProps<{ code: string }>()

/** How long it says it copied, in milliseconds. */
const SHOWN = 2000

const copied = shallowRef(false)
let timer: ReturnType<typeof setTimeout> | undefined
async function copy() {
  await navigator.clipboard.writeText(props.code)
  copied.value = true
  clearTimeout(timer)
  timer = setTimeout(() => (copied.value = false), SHOWN)
}
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <button type="button" class="hlx-code-copy" :aria-label="copied ? '已複製' : '複製程式碼'" @click="copy">
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path v-if="copied" d="M20 6 9 17l-5-5" />
      <template v-else>
        <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
      </template>
    </svg><span>{{ copied ? '已複製' : '複製' }}</span>
  </button>
</template>
