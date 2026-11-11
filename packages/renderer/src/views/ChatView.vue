<script setup lang="ts">
import type { ChatData, ChatMessageData, ChatParticipantData } from '../chat'
import { chatParticipantName, renderChatMarkdown } from '../chat'

const props = defineProps<{ chat: ChatData }>()

const participantOf = (message: ChatMessageData) => props.chat.participants.find(item => item.id === message.participantId)

/** Who is on the right: in `user-agent` the user, in `user-user` the second person. */
function side(message: ChatMessageData): 'left' | 'right' {
  if (props.chat.variant === 'user-user') {
    return props.chat.participants.findIndex(item => item.id === message.participantId) === 1
      ? 'right'
      : 'left'
  }
  return participantOf(message)?.kind === 'agent'
    ? 'left'
    : 'right'
}

const isBubble = (message: ChatMessageData) => props.chat.variant === 'user-user' || participantOf(message)?.kind !== 'agent'
const showsName = (message: ChatMessageData) => props.chat.variant === 'user-user' || !isBubble(message)

function initial(participant: ChatParticipantData | undefined): string {
  return [
    ...chatParticipantName(participant).trim(),
  ][0]?.toUpperCase() ?? '?'
}
</script>

<template>
  <div class="hlx-chat" :data-variant="chat.variant">
    <div
      v-for="message in chat.messages"
      :key="message.id"
      class="hlx-chat-row"
      :data-side="side(message)"
    >
      <span class="hlx-chat-avatar" aria-hidden="true">
        <img v-if="participantOf(message)?.avatar" :src="participantOf(message)!.avatar" alt="" loading="lazy">
        <template v-else>{{ initial(participantOf(message)) }}</template>
      </span>
      <div class="hlx-chat-message">
        <div v-if="showsName(message)" class="hlx-chat-author">
          {{ chatParticipantName(participantOf(message)) }}
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -- safe: see renderChatMarkdown -->
        <div :class="isBubble(message) ? 'hlx-chat-bubble' : 'hlx-chat-article'" class="hlx-chat-markdown" v-html="renderChatMarkdown(message.content)" />
      </div>
    </div>
  </div>
</template>
