<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { RichEditor, validateUrl } from '@hakulex/editor'
import { ToolbarPlugin } from '@hakulex/plugin-toolbar'
import { shallowRef } from 'vue'

const doc = shallowRef<SerializedEditorState | null>(null)
</script>

<template>
  <RichEditor v-model="doc" placeholder="選取文字，再按上方的按鈕">
    <template #toolbar>
      <ToolbarPlugin :validate-url="validateUrl" />
    </template>
  </RichEditor>
</template>
