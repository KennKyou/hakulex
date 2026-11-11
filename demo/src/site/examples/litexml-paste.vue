<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { RichEditor } from '@hakulex/editor'
import { LiteXmlPastePlugin } from '@hakulex/plugin-litexml-paste'
import { shallowRef } from 'vue'

const doc = shallowRef<SerializedEditorState | null>(null)
</script>

<template>
  <RichEditor v-model="doc" placeholder="把 LiteXML 貼在這裡">
    <LiteXmlPastePlugin />
  </RichEditor>
</template>
