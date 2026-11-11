<script setup lang="ts">
import { ChatView, normalizeChat } from '@hakulex/renderer'
import { computed, useTemplateRef } from 'vue'
import { useBlockToolbar, useContentBlock } from '../plugins/ContentBlockPlugin'
import BlockToolbar from './BlockToolbar.vue'

const props = defineProps<{
  nodeKey: string
  fields: Record<string, unknown>
}>()

const chat = computed(() => normalizeChat(props.fields))
const { editable, selected, edit, onClick, onKeydown } = useContentBlock(props.nodeKey, 'chat')
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
    <template v-if="chat.messages.length">
      <ChatView :chat="chat" />
    </template>
    <div v-else class="hlx-block-empty">
      <span>空的對話</span>
      <button v-if="editable" type="button" class="hlx-block-edit" @click.stop="edit">
        編輯
      </button>
    </div>
  </div>
  <BlockToolbar v-if="showToolbar" label="對話" :actions="[editAction]" :style="toolbarStyle" />
</template>
