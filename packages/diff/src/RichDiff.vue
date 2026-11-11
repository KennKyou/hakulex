<script setup lang="ts">
import type { NodeRenderer } from '@hakulex/renderer'
import type { ColorScheme, EditorVariant, ThemeTokens } from '@hakulex/style-token'
import type { SerializedEditorState, SerializedLexicalNode } from 'lexical'
import { computeDiff, computeInlineDiff } from '@hakulex/diff-core'
import { RichRenderer } from '@hakulex/renderer'
import { themeStyle } from '@hakulex/style-token'
import { computed } from 'vue'
import { buildInlineSegments } from './inline-segments'
import { buildRows } from './rows'

/*
 * What changed between two versions of a document: side by side,
 * or in one column with changed blocks merged. Each part is drawn by the read-only renderer, so
 * blocks look as they do anywhere else; the marks are in the text's own style.
 */
const props = withDefaults(defineProps<{
  oldValue: SerializedEditorState
  newValue: SerializedEditorState
  layout?: 'split' | 'inline'
  /** In one column, folds runs of unchanged blocks, keeping one on each side. */
  collapseUnchanged?: boolean
  variant?: EditorVariant
  colorScheme?: ColorScheme
  theme?: ThemeTokens
  renderers?: Record<string, NodeRenderer>
}>(), {
  layout: 'split',
  collapseUnchanged: false,
  variant: 'article',
  colorScheme: 'light',
  theme: undefined,
  renderers: undefined,
})

defineSlots<{
  /** What a fold says; `count` is how many blocks it holds. */
  collapsed?: (props: { count: number }) => unknown
}>()

const rows = computed(() => (props.layout === 'split'
  ? buildRows(computeDiff(props.oldValue, props.newValue))
  : []))
const segments = computed(() => (props.layout === 'inline'
  ? buildInlineSegments(computeInlineDiff(props.oldValue, props.newValue), { collapseUnchanged: props.collapseUnchanged, context: 1 })
  : []))

function document(nodes: SerializedLexicalNode[]) {
  return {
    root: {
      type: 'root',
      children: nodes,
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  }
}

const style = computed(() => {
  const vars = themeStyle(props.theme)
  return Object.keys(vars).length
    ? vars
    : undefined
})
</script>

<template>
  <div
    class="hlx-root hlx-diff"
    :data-variant="variant"
    :data-color-scheme="colorScheme"
    :data-layout="layout"
    :style="style"
  >
    <template v-if="layout === 'split'">
      <div class="hlx-diff-header">
        <div>舊版</div>
        <div>新版</div>
      </div>
      <div class="hlx-diff-body">
        <div v-for="(row, index) in rows" :key="index" class="hlx-diff-row">
          <div
            v-for="(side, column) in [row.left, row.right]"
            :key="column"
            class="hlx-diff-cell"
            :data-diff-type="side ? side.type : 'empty'"
          >
            <RichRenderer
              v-if="side"
              :value="document(side.nodes) as never"
              :variant="variant"
              :color-scheme="colorScheme"
              :theme="theme"
              :renderers="renderers"
              :heading-ids="false"
            />
          </div>
        </div>
      </div>
    </template>
    <div v-else class="hlx-diff-body">
      <template v-for="(segment, index) in segments" :key="index">
        <div v-if="segment.kind === 'collapsed'" class="hlx-diff-collapsed">
          <slot name="collapsed" :count="segment.count">
            {{ segment.count }} 個未變更的區塊
          </slot>
        </div>
        <div v-else class="hlx-diff-cell" :data-diff-type="segment.type">
          <RichRenderer
            :value="document(segment.nodes) as never"
            :variant="variant"
            :color-scheme="colorScheme"
            :theme="theme"
            :renderers="renderers"
            :heading-ids="false"
          />
        </div>
      </template>
    </div>
  </div>
</template>
