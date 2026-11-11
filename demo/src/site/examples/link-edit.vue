<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { RichEditor, validateUrl } from '@hakulex/editor'
import { LinkEditPlugin } from '@hakulex/plugin-link-edit'
import { shallowRef } from 'vue'
import { withLink } from './documents'

const doc = shallowRef<SerializedEditorState | null>(withLink)
</script>

<template>
  <RichEditor v-model="doc">
    <LinkEditPlugin :validate-url="validateUrl" />
  </RichEditor>
</template>
