<script setup lang="ts">
import { GalleryView, normalizeGallery } from '@hakulex/renderer'
import { computed, useTemplateRef } from 'vue'
import { useBlockToolbar, useContentBlock } from '../plugins/ContentBlockPlugin'
import BlockToolbar from './BlockToolbar.vue'

const props = defineProps<{
  nodeKey: string
  fields: Record<string, unknown>
}>()

const gallery = computed(() => normalizeGallery(props.fields))
const { editable, selected, edit, onClick, onKeydown } = useContentBlock(props.nodeKey, 'gallery')
const block = useTemplateRef<HTMLElement>('block')
const { showToolbar, toolbarStyle, editAction, onDblclick } = useBlockToolbar(block, selected, editable, edit)
</script>

<template>
  <div
    ref="block"
    class="hlx-block-editor"
    :data-selected="selected || undefined"
    @click="onClick"
    @dblclick="onDblclick"
    @keydown="onKeydown"
  >
    <template v-if="gallery.images.length">
      <GalleryView :gallery="gallery" />
    </template>
    <div v-else class="hlx-block-empty">
      <span>空的圖庫</span>
      <button v-if="editable" type="button" class="hlx-block-edit" @click.stop="edit">
        編輯
      </button>
    </div>
  </div>
  <BlockToolbar v-if="showToolbar" label="圖庫" :actions="[editAction]" :style="toolbarStyle" />
</template>
