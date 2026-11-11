<script setup lang="ts">
import { CodeSnippetView, normalizeSnippetFiles } from '@hakulex/renderer'
import { computed, useTemplateRef } from 'vue'
import { useBlockToolbar, useContentBlock } from '../plugins/ContentBlockPlugin'
import BlockToolbar from './BlockToolbar.vue'

const props = defineProps<{
  nodeKey: string
  files: unknown
}>()

const shown = computed(() => normalizeSnippetFiles(props.files))
const { editable, selected, edit, onClick, onKeydown } = useContentBlock(props.nodeKey, 'code-snippet')
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
    <CodeSnippetView v-if="shown.length" :files="shown" />
    <div v-else class="hlx-block-empty">
      <span>空的程式碼片段</span>
      <button v-if="editable" type="button" class="hlx-block-edit" @click.stop="edit">
        編輯
      </button>
    </div>
  </div>
  <BlockToolbar v-if="showToolbar" label="程式碼片段" :actions="[editAction]" :style="toolbarStyle" />
</template>
