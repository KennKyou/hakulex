<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { RichEditor } from '@hakulex/editor'
import { TablePlugin } from '@hakulex/plugin-table'
import { shallowRef } from 'vue'
import { withTable } from './documents'

const doc = shallowRef<SerializedEditorState | null>(withTable)
</script>

<template>
  <RichEditor v-model="doc">
    <TablePlugin />
  </RichEditor>
</template>
