<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { RichEditor } from '@hakulex/editor'
import { shallowRef } from 'vue'

const doc = shallowRef<SerializedEditorState | null>(null)
</script>

<template>
  <RichEditor v-model="doc" placeholder="開始輸入…" />
</template>
