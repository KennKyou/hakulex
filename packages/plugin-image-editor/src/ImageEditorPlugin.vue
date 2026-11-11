<script setup lang="ts">
import type { ImageEditResult } from '@hakulex/editor'
import { registerImageEditor, registerImagePreprocess, useImageTools } from '@hakulex/editor'
import { onBeforeUnmount, shallowRef } from 'vue'
import ImageEditModal from './ImageEditModal.vue'

/*
 * Put inside <RichEditor>: each image in the list of images to
 * insert can be opened in the edit screen, and pasted, dropped, replacing and gallery files are
 * listed before they are uploaded.
 */

interface Editing {
  file: File
  resolve: (result: ImageEditResult | null) => void
}

const tools = useImageTools()
const editing = shallowRef<Editing | null>(null)

function settle(result: ImageEditResult | null) {
  const current = editing.value
  editing.value = null
  current?.resolve(result)
}

registerImageEditor(tools, {
  edit: file => new Promise((resolve) => {
    // One at a time: a second gives up the first.
    settle(null)
    editing.value = { file, resolve }
  }),
})

// Pasted, dropped, replacing and gallery files go through the list first.
registerImagePreprocess(tools, async (files, meta) => {
  const review = tools.review.value
  return review
    ? review(files, meta)
    : files
})

onBeforeUnmount(() => settle(null))
</script>

<template>
  <ImageEditModal
    v-if="editing"
    :key="editing.file.name + editing.file.size + editing.file.lastModified"
    :file="editing.file"
    @confirm="settle"
    @cancel="settle(null)"
  />
</template>
