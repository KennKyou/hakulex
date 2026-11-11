<script setup lang="ts">
import type { InitialConfig } from '@hakulex/vue-lexical'
import { ContentEditable, HistoryPlugin, LexicalComposer, RichTextPlugin } from '@hakulex/vue-lexical'

const config: InitialConfig = {
  namespace: 'my-editor',
  onError: (error) => {
    throw error
  },
}
</script>

<template>
  <LexicalComposer :initial-config="config">
    <RichTextPlugin />
    <HistoryPlugin />
    <ContentEditable class="hlx-content" placeholder="開始輸入…" />
  </LexicalComposer>
</template>
