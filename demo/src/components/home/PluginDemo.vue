<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { RichEditor, validateUrl } from '@hakulex/editor'
import { BlockHandlePlugin } from '@hakulex/plugin-block-handle'
import { FloatingToolbarPlugin } from '@hakulex/plugin-floating-toolbar'
import { SlashMenuPlugin } from '@hakulex/plugin-slash-menu'
import { ToolbarPlugin } from '@hakulex/plugin-toolbar'
import { CodeSnippetView, normalizeSnippetFiles } from '@hakulex/renderer'
import { computed, reactive, shallowRef } from 'vue'
import { packagesOf, packagesPath } from '../../site/packages'
import { siteScheme } from '../../site/theme'

/*
 * Plugins, put together by hand: four switches, an editor that gains or loses each plugin as
 * its switch turns, and the code that would give the same editor.
 */
const CHOICES = [
  {
    key: 'toolbar',
    label: '工具列',
    name: 'ToolbarPlugin',
    from: '@hakulex/plugin-toolbar',
  },
  {
    key: 'floating',
    label: '浮動工具列',
    name: 'FloatingToolbarPlugin',
    from: '@hakulex/plugin-floating-toolbar',
  },
  {
    key: 'slash',
    label: '斜線選單',
    name: 'SlashMenuPlugin',
    from: '@hakulex/plugin-slash-menu',
  },
  {
    key: 'handle',
    label: '區塊把手',
    name: 'BlockHandlePlugin',
    from: '@hakulex/plugin-block-handle',
  },
] as const
type Key = typeof CHOICES[number]['key']

const on = reactive<Record<Key, boolean>>({
  toolbar: true,
  floating: false,
  slash: true,
  handle: false,
})
const total = packagesOf('plugin').length

function text(value: string) {
  return {
    type: 'text',
    version: 1,
    text: value,
    format: 0,
    style: '',
    mode: 'normal',
    detail: 0,
  }
}
const doc = shallowRef<SerializedEditorState | null>({
  root: {
    type: 'root',
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    children: [
      {
        type: 'paragraph',
        version: 1,
        format: '',
        indent: 0,
        direction: null,
        textFormat: 0,
        textStyle: '',
        children: [
          text('選取這段文字，或在下一行打 /。'),
        ],
      },
      {
        type: 'paragraph',
        version: 1,
        format: '',
        indent: 0,
        direction: null,
        textFormat: 0,
        textStyle: '',
        children: [],
      },
    ],
  },
} as unknown as SerializedEditorState)

/** The same editor, written out: only what is switched on. */
const files = computed(() => {
  const used = CHOICES.filter(choice => on[choice.key])
  const inside = used.flatMap(choice => choice.key === 'toolbar'
    ? ['    <template #toolbar>', '      <ToolbarPlugin />', '    </template>']
    : [`    <${choice.name} />`])
  const code = [
    '<script setup>',
    'import { RichEditor } from \'@hakulex/editor\'',
    ...used.map(choice => `import { ${choice.name} } from '${choice.from}'`),
    'import { ref } from \'vue\'',
    '',
    'const doc = ref(null)',
    '<\/script>',
    '',
    '<template>',
    ...(inside.length
      ? ['  <RichEditor v-model="doc">', ...inside, '  </RichEditor>']
      : ['  <RichEditor v-model="doc" />']),
    '</template>',
  ].join('\n')
  return normalizeSnippetFiles([
    { filename: 'Editor.vue', language: 'vue', code },
  ])
})
</script>

<template>
  <div class="plugin-demo">
    <div class="plugin-demo-switches" role="group" aria-label="要裝的外掛">
      <button
        v-for="choice in CHOICES"
        :key="choice.key"
        type="button"
        class="plugin-demo-switch"
        :aria-pressed="on[choice.key]"
        @click="on[choice.key] = !on[choice.key]"
      >
        <i aria-hidden="true" />
        {{ choice.label }}
      </button>
    </div>
    <div class="plugin-demo-editor">
      <RichEditor v-model="doc" :color-scheme="siteScheme" placeholder="開始輸入…">
        <template v-if="on.toolbar" #toolbar>
          <ToolbarPlugin :validate-url="validateUrl" />
        </template>
        <FloatingToolbarPlugin v-if="on.floating" :validate-url="validateUrl" />
        <SlashMenuPlugin v-if="on.slash" />
        <BlockHandlePlugin v-if="on.handle" />
      </RichEditor>
    </div>
    <CodeSnippetView :files="files" />
    <RouterLink :to="packagesPath('plugin')" class="plugin-demo-all">
      全部 {{ total }} 個外掛
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
    </RouterLink>
  </div>
</template>

<style scoped>
.plugin-demo {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.plugin-demo-switches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.plugin-demo-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px 4px 6px;
  border: 1px solid var(--hlx-color-border);
  border-radius: 999px;
  background: var(--hlx-color-bg);
  color: var(--hlx-color-text-secondary);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

/* A small switch: the knob slides over and the track takes the accent when it is on. */
.plugin-demo-switch i {
  position: relative;
  width: 24px;
  height: 14px;
  border-radius: 999px;
  background: var(--hlx-color-fill);
  transition: background 0.15s;
}

.plugin-demo-switch i::after {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--hlx-color-bg);
  content: '';
  transition: transform 0.15s;
}

.plugin-demo-switch[aria-pressed='true'] {
  border-color: var(--hlx-color-accent);
  color: var(--hlx-color-text);
}

.plugin-demo-switch[aria-pressed='true'] i {
  background: var(--hlx-color-accent);
}

.plugin-demo-switch[aria-pressed='true'] i::after {
  transform: translateX(10px);
}

.plugin-demo-switch:focus-visible {
  outline: 2px solid var(--hlx-color-accent);
  outline-offset: 2px;
}

.plugin-demo-editor {
  overflow: hidden;
  border: 1px solid var(--hlx-color-border);
  border-radius: 10px;
  background: var(--hlx-color-bg);
}

.plugin-demo-editor :deep(.hlx-fixed-toolbar) {
  position: static;
  margin: 0;
  padding: 6px 10px;
}

/* The block handle sits just left of the content: the margin keeps it inside this box. */
.plugin-demo-editor :deep(.hlx-content) {
  min-height: 96px;
  margin-left: 58px;
  padding: 14px 20px 14px 0;
}

.plugin-demo-all {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  justify-self: start;
  color: var(--hlx-color-text-secondary);
  font-size: 13px;
  text-decoration: none;
}

.plugin-demo-all:hover {
  color: var(--hlx-color-text);
}

@media (prefers-reduced-motion: reduce) {
  .plugin-demo-switch i,
  .plugin-demo-switch i::after {
    transition: none;
  }
}
</style>
