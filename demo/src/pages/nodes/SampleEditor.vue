<script setup lang="ts">
import type { EditorVariant } from '@hakulex/editor'
import type { SerializedEditorState } from 'lexical'
import { RichEditor, validateUrl } from '@hakulex/editor'
import { BlockHandlePlugin } from '@hakulex/plugin-block-handle'
import { FloatingToolbarPlugin } from '@hakulex/plugin-floating-toolbar'
import { LinkEditPlugin } from '@hakulex/plugin-link-edit'
import { MentionMenuPlugin } from '@hakulex/plugin-mention'
import { SlashMenuPlugin } from '@hakulex/plugin-slash-menu'
import { TablePlugin } from '@hakulex/plugin-table'
import { siteScheme } from '../../site/theme'

/* One sample in an editor. The top toolbar and the image editor have pages of their own. */
defineProps<{ variant: EditorVariant }>()
const value = defineModel<SerializedEditorState | null>()
</script>

<template>
  <div class="sample-editor">
    <RichEditor v-model="value" :variant="variant" :color-scheme="siteScheme">
      <FloatingToolbarPlugin :validate-url="validateUrl" />
      <LinkEditPlugin :validate-url="validateUrl" />
      <SlashMenuPlugin />
      <MentionMenuPlugin />
      <template #nested>
        <FloatingToolbarPlugin :validate-url="validateUrl" />
        <LinkEditPlugin :validate-url="validateUrl" />
        <SlashMenuPlugin />
        <MentionMenuPlugin />
      </template>
      <TablePlugin />
      <BlockHandlePlugin />
    </RichEditor>
  </div>
</template>

<style scoped>
/* Room on the left for the block handle. */
.sample-editor {
  padding-left: var(--hlx-space-xl);
}
</style>
