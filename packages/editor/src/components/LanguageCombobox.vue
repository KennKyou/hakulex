<script setup lang="ts">
import { CODE_LANGUAGES, normalizeLanguage } from '@hakulex/renderer'
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxTrigger,
  ComboboxViewport,
} from 'reka-ui'
import { onMounted, shallowRef, useTemplateRef } from 'vue'
import { useEditorTheme } from '../theme-context'

defineProps<{ disabled?: boolean }>()
const model = defineModel<string>({ required: true })

const theme = useEditorTheme()

/*
 * Where the list goes. A modal dialog makes everything outside it unclickable, so in one the
 * list goes inside the dialog; elsewhere it goes to the body, clear of anything that clips.
 */
const anchor = useTemplateRef<{ $el: HTMLElement }>('anchor')
const portal = shallowRef<string | HTMLElement>('body')
onMounted(() => {
  const dialog = anchor.value?.$el?.closest?.('[role="dialog"]')
  if (dialog instanceof HTMLElement)
    portal.value = dialog
})
function label(id: unknown) {
  return normalizeLanguage(typeof id === 'string'
    ? id
    : '').label
}

/**
 * The picker sits inside Lexical's root, so its keystrokes would bubble into
 * Lexical's handlers (Cmd+A selecting the document, Enter splitting blocks...).
 * Escape still bubbles so Reka can close the list.
 */
function isolateKeys(event: KeyboardEvent) {
  if (event.key !== 'Escape')
    event.stopPropagation()
}

// Safari clears the selection when the press that focused the input ends.
let justFocused = false

function selectAll(event: FocusEvent) {
  justFocused = true
  ;(event.target as HTMLInputElement).select()
}

function keepSelection(event: MouseEvent) {
  if (justFocused)
    event.preventDefault()
  justFocused = false
}
</script>

<template>
  <ComboboxRoot v-model="model" :disabled="disabled" open-on-click reset-search-term-on-blur>
    <ComboboxAnchor ref="anchor" class="hlx-lang-anchor">
      <ComboboxInput
        class="hlx-lang-input"
        :display-value="label"
        aria-label="程式語言"
        placeholder="搜尋語言"
        spellcheck="false"
        @keydown="isolateKeys"
        @focus="selectAll"
        @mouseup="keepSelection"
      />
      <ComboboxTrigger class="hlx-lang-trigger" aria-label="選擇程式語言">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
      </ComboboxTrigger>
    </ComboboxAnchor>
    <ComboboxPortal :to="portal">
      <ComboboxContent
        class="hlx-root hlx-lang-content"
        position="popper"
        align="start"
        :side-offset="4"
        :data-variant="theme.variant"
        :data-color-scheme="theme.colorScheme"
        :style="theme.style"
      >
        <ComboboxViewport class="hlx-lang-viewport">
          <ComboboxEmpty class="hlx-lang-empty">
            找不到這個語言
          </ComboboxEmpty>
          <ComboboxItem
            v-for="language in CODE_LANGUAGES"
            :key="language.id"
            :value="language.id"
            :text-value="[language.label, language.id, ...(language.aliases ?? [])].join(' ')"
            class="hlx-lang-item"
          >
            {{ language.label }}
          </ComboboxItem>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>
