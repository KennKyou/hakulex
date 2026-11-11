<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { RichEditor, validateUrl } from '@hakulex/editor'
import { FloatingToolbarPlugin } from '@hakulex/plugin-floating-toolbar'
import { shallowRef } from 'vue'
import { paragraphs } from './documents'

const doc = shallowRef<SerializedEditorState | null>(paragraphs)
</script>

<template>
  <RichEditor v-model="doc">
    <FloatingToolbarPlugin :validate-url="validateUrl" />
  </RichEditor>
</template>
