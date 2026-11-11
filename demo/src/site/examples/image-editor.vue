<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { RichEditor, validateUrl } from '@hakulex/editor'
import { ImageEditorPlugin } from '@hakulex/plugin-image-editor'
import { ToolbarPlugin } from '@hakulex/plugin-toolbar'
import { shallowRef } from 'vue'

const doc = shallowRef<SerializedEditorState | null>(null)

// Replace this with an upload to your own storage.
async function uploadImage(file: File) {
  const { width, height } = await createImageBitmap(file)
  return {
    src: URL.createObjectURL(file),
    width,
    height,
  }
}
</script>

<template>
  <RichEditor v-model="doc" :upload-image="uploadImage" placeholder="在「插入」選單選擇圖片">
    <template #toolbar>
      <ToolbarPlugin :validate-url="validateUrl" />
    </template>
    <ImageEditorPlugin />
  </RichEditor>
</template>
