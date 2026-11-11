import type { ColorScheme } from '@hakulex/editor'
import { computed, ref, watchEffect } from 'vue'

/* The site's color theme, remembered in this browser. */

export type ThemeMode = 'system' | 'light' | 'dark'

const KEY = 'hakulex-demo-theme'
const MODES: readonly string[] = ['system', 'light', 'dark']

function stored(): ThemeMode {
  try {
    const value = localStorage.getItem(KEY)
    return value && MODES.includes(value)
      ? value as ThemeMode
      : 'system'
  }
  catch {
    return 'system'
  }
}

const media = window.matchMedia('(prefers-color-scheme: dark)')
const systemDark = ref(media.matches)
media.addEventListener('change', event => systemDark.value = event.matches)

export const themeMode = ref<ThemeMode>(stored())

export function setThemeMode(mode: ThemeMode) {
  themeMode.value = mode
  try {
    localStorage.setItem(KEY, mode)
  }
  catch {
    // Without storage the choice just lasts until the page reloads.
  }
}

export const siteScheme = computed<ColorScheme>(() => {
  if (themeMode.value === 'system')
    return systemDark.value ? 'dark' : 'light'
  return themeMode.value
})

watchEffect(() => {
  document.documentElement.style.colorScheme = siteScheme.value
})
