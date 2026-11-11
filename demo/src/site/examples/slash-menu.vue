<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { RichEditor } from '@hakulex/editor'
import { SlashMenuPlugin } from '@hakulex/plugin-slash-menu'
import { shallowRef } from 'vue'

const doc = shallowRef<SerializedEditorState | null>(null)
</script>

<template>
  <RichEditor v-model="doc" placeholder="打 / 插入區塊">
    <SlashMenuPlugin />
  </RichEditor>
</template>
