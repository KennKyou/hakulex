<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { RichEditor } from '@hakulex/editor'
import { BlockHandlePlugin } from '@hakulex/plugin-block-handle'
import { shallowRef } from 'vue'
import { paragraphs } from './documents'

const doc = shallowRef<SerializedEditorState | null>(paragraphs)
</script>

<template>
  <RichEditor v-model="doc">
    <BlockHandlePlugin />
  </RichEditor>
</template>
