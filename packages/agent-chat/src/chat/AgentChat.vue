<script setup lang="ts">
import type { AgentSelection } from '@hakulex/agent-core'
import type { AgentController } from '@hakulex/plugin-agent'
import type { ColorScheme } from '@hakulex/style-token'
import { ROOT_CLASS } from '@hakulex/style-token'
import { ArrowDown, ArrowUp, Square, TextQuote, X } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import ChatReply from './ChatReply.vue'

/*
 * The conversation with an agent: what was said, what the agent did, and a place to write.
 * It fills the box it is put in; where that box goes (a side column, a drawer) is the page's
 * business. Accepting and rejecting what the agent proposes happens in the editor, not here.
 */
const props = withDefaults(defineProps<{
  /** The agent to talk to, from `useAgent`: the one `<AgentPlugin>` has too. */
  agent: AgentController
  /** What the empty input says. */
  placeholder?: string
  /** Things to ask, offered while the conversation is empty. */
  suggestions?: string[]
  /** Light or dark, as on the editor: the panel stands outside it and carries its own. */
  colorScheme?: ColorScheme
}>(), {
  placeholder: '輸入訊息',
  suggestions: () => [],
  colorScheme: 'light',
})

const state = computed(() => props.agent.state.value)
const ready = computed(() => props.agent.ready.value)
const running = computed(() => state.value.status === 'running')
const messages = computed(() => state.value.messages)
/** An error that has no reply of its own to show under, as when nothing could be sent. */
const looseError = computed(() => {
  const last = messages.value.at(-1)
  const shown = last?.role === 'assistant' && last.stopped === 'error'
  return state.value.status === 'error' && !shown
    ? (state.value.error ?? '發生錯誤，沒有完成。')
    : ''
})

const root = ref<HTMLElement>()
const list = ref<HTMLElement>()
const field = ref<HTMLTextAreaElement>()
const text = ref('')
const composing = ref(false)

// The list follows the newest words for as long as the reader stays at the bottom.
const following = ref(true)
function onScroll() {
  const box = list.value
  if (box)
    following.value = box.scrollHeight - box.scrollTop - box.clientHeight < 24
}
function toNewest() {
  const box = list.value
  if (box)
    box.scrollTop = box.scrollHeight
  following.value = true
}
watch(state, () => {
  if (following.value)
    nextTick(toNewest)
}, { flush: 'post' })

/*
 * What is selected in the editor, to send along. It is read while the reader is in the editor
 * and held from then on: going to the input takes the caret out of the editor.
 */
const picked = shallowRef<AgentSelection>()
function onSelectionChange() {
  // The editor updates its own idea of the selection on the same event: read after it has.
  Promise.resolve().then(() => {
    if (!root.value?.contains(document.activeElement))
      picked.value = props.agent.selection()
  })
}
onMounted(() => document.addEventListener('selectionchange', onSelectionChange))
onBeforeUnmount(() => document.removeEventListener('selectionchange', onSelectionChange))
const pickedLabel = computed(() => {
  const selection = picked.value
  if (!selection)
    return ''
  if ('text' in selection) {
    return selection.text.length > 40
      ? `${selection.text.slice(0, 40)}…`
      : selection.text
  }
  return `已選取 ${selection.blockIds.length} 個區塊`
})

function send(value = text.value) {
  const words = value.trim()
  if (!words || running.value || !ready.value)
    return
  const selection = picked.value
  picked.value = undefined
  if (value === text.value)
    text.value = ''
  following.value = true
  // A failure shows in the conversation; nothing more to do with it here.
  props.agent.send(words, selection
    ? { selection }
    : undefined).catch(() => {})
  nextTick(grow)
}
function onKeydown(event: KeyboardEvent) {
  // The Enter that picks a word in an input method is not for us (229 is how some browsers say so).
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing || composing.value || event.keyCode === 229)
    return
  event.preventDefault()
  send()
}
/** As tall as what is written, up to a point. */
function grow() {
  const element = field.value
  if (!element)
    return
  element.style.height = 'auto'
  element.style.height = `${Math.min(element.scrollHeight, 160)}px`
}
function retry() {
  props.agent.retry().catch(() => {})
}
</script>

<template>
  <div ref="root" class="hlx-chat" :class="ROOT_CLASS" :data-color-scheme="colorScheme">
    <div class="hlx-chat-body">
      <div
        ref="list"
        class="hlx-chat-list"
        role="log"
        aria-live="polite"
        aria-label="和 AI 的對話"
        tabindex="0"
        @scroll="onScroll"
      >
        <div v-if="messages.length === 0" class="hlx-chat-empty">
          <p>告訴 AI 你想怎麼改這份文件。</p>
          <button
            v-for="suggestion in suggestions"
            :key="suggestion"
            type="button"
            class="hlx-chat-suggestion"
            :disabled="!ready"
            @click="send(suggestion)"
          >
            {{ suggestion }}
          </button>
        </div>
        <template v-for="(message, index) in messages" :key="message.id">
          <div v-if="message.role === 'user'" class="hlx-chat-message" data-role="user">
            {{ message.text }}
          </div>
          <ChatReply
            v-else
            :message="message"
            :running="running && index === messages.length - 1"
            :error="state.error"
            @retry="retry"
          />
        </template>
        <div v-if="looseError" class="hlx-chat-message" data-role="assistant">
          <div class="hlx-chat-error">
            <span>{{ looseError }}</span>
            <button type="button" class="hlx-chat-button" @click="retry">
              重試
            </button>
          </div>
        </div>
      </div>
      <button v-if="!following" type="button" class="hlx-chat-jump" aria-label="跳到最新" @click="toNewest">
        <ArrowDown class="hlx-chat-icon" aria-hidden="true" />
      </button>
    </div>

    <div class="hlx-chat-box">
      <p v-if="!ready" class="hlx-chat-note">
        還沒有接上編輯器，接上之後才能送出訊息。
      </p>
      <span v-if="picked" class="hlx-chat-selection">
        <TextQuote class="hlx-chat-icon" aria-hidden="true" />
        <span class="hlx-chat-selection-text">{{ pickedLabel }}</span>
        <button type="button" class="hlx-chat-selection-remove" aria-label="移除選取" @click="picked = undefined">
          <X class="hlx-chat-icon" aria-hidden="true" />
        </button>
      </span>
      <div class="hlx-chat-row">
        <textarea
          ref="field"
          v-model="text"
          class="hlx-chat-input"
          rows="1"
          aria-label="給 AI 的訊息"
          :placeholder="placeholder"
          :disabled="!ready"
          @keydown="onKeydown"
          @input="grow"
          @compositionstart="composing = true"
          @compositionend="composing = false"
        />
        <button v-if="running" type="button" class="hlx-chat-send" aria-label="中止" @click="agent.stop()">
          <Square class="hlx-chat-icon" aria-hidden="true" />
        </button>
        <button v-else type="button" class="hlx-chat-send" aria-label="送出" :disabled="!ready || !text.trim()" @click="send()">
          <ArrowUp class="hlx-chat-icon" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>
