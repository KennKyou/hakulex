<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { RichEditor } from '@hakulex/editor'
import { MentionMenuPlugin } from '@hakulex/plugin-mention'
import { shallowRef } from 'vue'

const doc = shallowRef<SerializedEditorState | null>(null)
</script>

<template>
  <RichEditor v-model="doc" placeholder="打 @ 提及帳號">
    <MentionMenuPlugin />
  </RichEditor>
</template>
