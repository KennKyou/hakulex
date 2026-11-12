<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { RichEditor } from '@hakulex/editor'
import { BlockIdPlugin } from '@hakulex/plugin-block-id'
import { shallowRef } from 'vue'
import { article } from './documents'

const doc = shallowRef<SerializedEditorState | null>(article)
</script>

<template>
  <RichEditor v-model="doc" class="with-ids">
    <BlockIdPlugin />
  </RichEditor>
</template>

<style scoped>
/* Only for this demo: shows each block's ID beside it. The plugin itself draws nothing. */
.with-ids :deep(.hlx-content) {
  padding-right: 96px;
}

.with-ids :deep([data-block-id]) {
  position: relative;
}

.with-ids :deep([data-block-id])::after {
  content: attr(data-block-id);
  position: absolute;
  top: 0;
  right: -96px;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  font-weight: 400;
  line-height: 2;
  opacity: 0.55;
  user-select: none;
}
</style>
