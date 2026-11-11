<script setup lang="ts">
import type { ThemeMode } from '../../site/theme'
import { computed } from 'vue'
import { setThemeMode, themeMode } from '../../site/theme'

/* One button for the theme: it shows the one in use, and a press goes to the next. */
const modes: { value: ThemeMode, label: string }[] = [
  { value: 'system', label: '系統' },
  { value: 'light', label: '淺色' },
  { value: 'dark', label: '深色' },
]
const label = computed(() => modes.find(mode => mode.value === themeMode.value)!.label)

function next() {
  const at = modes.findIndex(mode => mode.value === themeMode.value)
  setThemeMode(modes[(at + 1) % modes.length].value)
}
</script>

<template>
  <button
    type="button"
    class="theme-button"
    :data-theme-mode="themeMode"
    :aria-label="`主題：${label}，按一下換下一個`"
    :title="`主題：${label}`"
    @click="next"
  >
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <template v-if="themeMode === 'light'">
        <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </template>
      <path v-else-if="themeMode === 'dark'" d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      <template v-else>
        <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
      </template>
    </svg>
  </button>
</template>

<style scoped>
.theme-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--hlx-color-text-secondary);
  cursor: pointer;
}

.theme-button:hover {
  background: var(--hlx-color-fill-secondary);
  color: var(--hlx-color-text);
}

.theme-button:focus-visible {
  outline: 2px solid var(--hlx-color-accent);
  outline-offset: 2px;
}
</style>
