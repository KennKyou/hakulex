<script setup lang="ts">
import { $toMarkdown, allHeadlessNodes } from '@hakulex/headless'
import { createHeadlessEditor } from '@lexical/headless'
import { article } from './documents'

const editor = createHeadlessEditor({
  nodes: allHeadlessNodes,
  onError: (error) => {
    throw error
  },
})
const markdown = editor.parseEditorState(JSON.stringify(article)).read(() => $toMarkdown())
</script>

<template>
  <pre>{{ markdown }}</pre>
</template>
