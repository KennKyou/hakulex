<script setup lang="ts">
import type { SlashMenuItem } from '@hakulex/plugin-slash-menu'
import type { SerializedEditorState } from 'lexical'
import { RichEditor } from '@hakulex/editor'
import { builtinSlashItems, SlashMenuPlugin } from '@hakulex/plugin-slash-menu'
import { shallowRef } from 'vue'
import { siteScheme } from '../../site/theme'
import SlashDemoStart from './SlashDemoStart.vue'

/*
 * The slash menu, shown before anyone types: a line with `/` on it and some of the menu's own
 * items under it, drawn with the plugin's data and styles. Picking one swaps in the real editor
 * with that block inserted; clicking the line swaps it in with the real menu open.
 */
const PREVIEW = [
  'table',
  'code',
  'check-list',
  'alert',
  'mermaid',
]
const items = PREVIEW.flatMap(key => builtinSlashItems.filter(item => item.key === key))

const doc = shallowRef<SerializedEditorState | null>(null)
/** `null` until the visitor tries it; then what they picked, or nothing for the menu itself. */
const tried = shallowRef<{ item?: SlashMenuItem } | null>(null)

function again() {
  tried.value = null
  doc.value = null
}
</script>

<template>
  <div v-if="!tried" class="slash-preview">
    <button type="button" class="slash-preview-line" aria-label="在編輯器打 / 試試" @click="tried = {}">
      <span>/</span><i aria-hidden="true" />
    </button>
    <div class="hlx-root hlx-slash-menu slash-preview-menu" :data-color-scheme="siteScheme" role="group" aria-label="插入區塊">
      <button
        v-for="(item, index) in items"
        :key="item.key"
        type="button"
        class="hlx-slash-item"
        :data-first="index === 0 || undefined"
        @click="tried = { item }"
      >
        <span class="hlx-slash-icon" aria-hidden="true">
          <component :is="item.icon" v-if="item.icon" :size="18" :stroke-width="1.75" />
        </span>
        <span class="hlx-slash-text">
          <span class="hlx-slash-title">{{ item.title }}</span>
          <span v-if="item.description" class="hlx-slash-description">{{ item.description }}</span>
        </span>
      </button>
    </div>
    <p class="slash-preview-hint">
      點一個項目插入看看
    </p>
  </div>
  <div v-else class="slash-live">
    <RichEditor v-model="doc" :color-scheme="siteScheme" placeholder="打 / 插入區塊">
      <SlashMenuPlugin />
      <SlashDemoStart :item="tried.item" />
    </RichEditor>
    <button type="button" class="slash-again" @click="again">
      重新示範
    </button>
  </div>
</template>

<style scoped>
.slash-preview {
  display: grid;
  gap: 8px;
  justify-items: start;
}

.slash-preview-line {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--hlx-color-text);
  font: inherit;
  font-size: 16px;
  line-height: 1.75;
  cursor: text;
}

/* A caret after the slash, blinking as one does. */
.slash-preview-line i {
  width: 1.5px;
  height: 1.15em;
  background: var(--hlx-color-text);
  animation: slash-caret 1.1s steps(1) infinite;
}

@keyframes slash-caret {
  50% {
    opacity: 0;
  }
}

/* The plugin's own menu, in the flow here rather than floating at a caret. */
.slash-preview-menu {
  position: static;
  max-height: none;
}

.slash-preview-menu .hlx-slash-item {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
}

.slash-preview-menu .hlx-slash-item[data-first],
.slash-preview-menu .hlx-slash-item:hover,
.slash-preview-menu .hlx-slash-item:focus-visible {
  background: var(--hlx-color-bg-subtle);
  outline: none;
}

.slash-preview-menu:hover .hlx-slash-item[data-first]:not(:hover) {
  background: transparent;
}

.slash-preview-hint {
  margin: 0;
  color: var(--hlx-color-text-tertiary);
  font-size: 12px;
}

.slash-live {
  display: grid;
  gap: 12px;
  justify-items: start;
}

.slash-live :deep(.hlx-editor) {
  justify-self: stretch;
}

.slash-again {
  padding: 2px 8px;
  border: 1px solid var(--hlx-color-border);
  border-radius: 6px;
  background: transparent;
  color: var(--hlx-color-text-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.slash-again:hover {
  color: var(--hlx-color-text);
}

@media (prefers-reduced-motion: reduce) {
  .slash-preview-line i {
    animation: none;
  }
}
</style>
