<script setup lang="ts">
import type { AgentMessage } from '@hakulex/agent-core'
import { renderChatMarkdown } from '@hakulex/renderer'
import { Check, ChevronRight, LoaderCircle, X } from '@lucide/vue'
import { computed, ref } from 'vue'
import { describeStep } from './steps'

/* One reply of the model: what it said, what it did, and how it ended when not by itself. */
const props = defineProps<{
  message: Extract<AgentMessage, { role: 'assistant' }>
  /** Whether this reply is still coming. */
  running: boolean
  /** Why it failed, when it did. */
  error?: string
}>()
defineEmits<{ retry: [] }>()

const open = ref(false)
/*
 * Safe to put on the page: anything the model wrote as HTML comes out as text. Images are
 * taken out as well, leaving their description. A reply is written by a model that has read
 * the whole document, and a picture is fetched the moment it is shown: text hidden in a
 * document could have the model put the document's words into a picture's address.
 */
const html = computed(() => renderChatMarkdown(props.message.text)
  .replace(/<img\b[^>]*>/gi, tag => /\balt="([^"]*)"/.exec(tag)?.[1] ?? ''))
const waiting = computed(() => props.running && !props.message.text && props.message.tools.length === 0)
const ended = computed(() => {
  if (props.message.stopped === 'aborted')
    return '已中止'
  if (props.message.stopped === 'rounds')
    return '已達到一次可以處理的上限。再送一則訊息可以讓它繼續。'
  return ''
})
</script>

<template>
  <div class="hlx-chat-message" data-role="assistant" :data-running="running ? '' : undefined">
    <template v-if="message.thinking">
      <button
        type="button"
        class="hlx-chat-thinking-toggle hlx-chat-line"
        :aria-expanded="open"
        @click="open = !open"
      >
        <ChevronRight class="hlx-chat-icon" :data-open="open ? '' : undefined" aria-hidden="true" />
        思考過程
      </button>
      <div v-if="open" class="hlx-chat-thinking">
        {{ message.thinking }}
      </div>
    </template>
    <!-- eslint-disable-next-line vue/no-v-html -- renderChatMarkdown escapes HTML in the source -->
    <div v-if="message.text" class="hlx-chat-text" v-html="html" />
    <div
      v-for="use in message.tools"
      :key="use.id"
      class="hlx-chat-step hlx-chat-line"
      :data-state="use.state"
    >
      <LoaderCircle v-if="use.state === 'running'" class="hlx-chat-icon hlx-chat-spin" aria-hidden="true" />
      <X v-else-if="use.state === 'failed'" class="hlx-chat-icon" aria-hidden="true" />
      <Check v-else class="hlx-chat-icon" aria-hidden="true" />
      {{ describeStep(use) }}
    </div>
    <div v-if="running" class="hlx-chat-line">
      <LoaderCircle class="hlx-chat-icon hlx-chat-spin" aria-hidden="true" />
      {{ waiting ? '思考中' : '回覆中' }}
    </div>
    <div v-else-if="ended" class="hlx-chat-line">
      {{ ended }}
    </div>
    <div v-else-if="message.stopped === 'error'" class="hlx-chat-error">
      <span>{{ error || '發生錯誤，沒有完成。' }}</span>
      <button type="button" class="hlx-chat-button" @click="$emit('retry')">
        重試
      </button>
    </div>
  </div>
</template>
