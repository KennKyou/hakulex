<script setup lang="ts">
import type { ChatVariant } from '@hakulex/renderer'
import type { BlockFields } from '../plugins/ContentBlockPlugin'
import { chatParticipantName, isSafeImageSrc, normalizeChat } from '@hakulex/renderer'
import { computed, reactive, shallowRef } from 'vue'
import BlockDialog from './BlockDialog.vue'

const props = defineProps<{ initial?: BlockFields }>()
const emit = defineEmits<{ save: [fields: BlockFields, unchanged: boolean], cancel: [] }>()

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
function createId(prefix: string, length: number) {
  let id = prefix
  for (let i = 0; i < length; i++)
    id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)]
  return id
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
function asList(value: unknown) {
  return Array.isArray(value)
    ? value.filter(isObject)
    : []
}
function asText(value: unknown) {
  return typeof value === 'string'
    ? value
    : ''
}

/* Drafts keep what they came from, so fields this dialog doesn't know stay. */

interface PersonDraft {
  source: Record<string, unknown>
  id: string
  kind: 'user' | 'agent'
  name: string
  avatar: string
}

interface MessageDraft {
  key: number
  source: Record<string, unknown>
  id: string
  participantId: string
  content: string
}

const variant = shallowRef<ChatVariant>(normalizeChat(props.initial ?? {}).variant)

const storedPeople = asList(props.initial?.participants).filter(person => typeof person.id === 'string')
const people = reactive<PersonDraft[]>(storedPeople.length
  ? storedPeople.map(source => ({
      source,
      id: source.id as string,
      kind: source.kind === 'agent'
        ? 'agent' as const
        : 'user' as const,
      name: asText(source.name),
      avatar: asText(source.avatar),
    }))
  : [
      {
        source: {},
        id: createId('p_', 6),
        kind: 'user' as const,
        name: '',
        avatar: '',
      },
      {
        source: {},
        id: createId('p_', 6),
        kind: 'agent' as const,
        name: '',
        avatar: '',
      },
    ])

let nextKey = 1
const messages = reactive<MessageDraft[]>(asList(props.initial?.messages)
  .filter(message => typeof message.participantId === 'string' && typeof message.content === 'string')
  .map((source, index) => ({
    key: nextKey++,
    source,
    id: typeof source.id === 'string'
      ? source.id
      : String(index),
    participantId: source.participantId as string,
    content: source.content as string,
  })))

function result(): BlockFields {
  return {
    variant: variant.value,
    participants: people.map(({ source, id, kind, name, avatar }) => {
      const { name: _name, avatar: _avatar, ...rest } = source
      return {
        ...rest,
        id,
        kind,
        ...(name.trim()
          ? {
              name: name.trim(),
            }
          : {}),
        ...(avatar.trim()
          ? {
              avatar: avatar.trim(),
            }
          : {}),
      }
    }),
    messages: messages.map(({ source, id, participantId, content }) => ({
      ...source,
      id,
      participantId,
      content,
    })),
  }
}

const baseline = JSON.stringify(result())
const dirty = computed(() => JSON.stringify(result()) !== baseline)
const error = shallowRef<string | null>(null)
const invalid = shallowRef(new Set<string>())

/* The variant says what the second person is. */
function onVariantChange() {
  if (people[1]) {
    people[1].kind = variant.value === 'user-user'
      ? 'user'
      : 'agent'
  }
}

const label = (person: PersonDraft) => chatParticipantName({ kind: person.kind, name: person.name.trim() || undefined })
function kindLabel(person: PersonDraft) {
  return person.kind === 'agent'
    ? '助理'
    : '使用者'
}
const isKnown = (id: string) => people.some(person => person.id === id)

function addMessage() {
  messages.push({
    key: nextKey++,
    source: {},
    id: createId('m_', 8),
    participantId: messages.at(-1)?.participantId ?? people[0]?.id ?? '',
    content: '',
  })
}

function moveMessage(index: number, delta: -1 | 1) {
  const moved = messages[index]
  messages[index] = messages[index + delta]
  messages[index + delta] = moved
}

function save() {
  if (!dirty.value && props.initial) {
    emit('save', result(), true)
    return
  }
  const unsafe = people.filter(person => person.avatar.trim() && !isSafeImageSrc(person.avatar.trim()))
  invalid.value = new Set(unsafe.map(person => person.id))
  if (unsafe.length) {
    error.value = '有頭像網址無法使用。'
    return
  }
  emit('save', result(), false)
}
</script>

<template>
  <BlockDialog
    :title="initial ? '編輯對話' : '插入對話'"
    description="修改參與者和訊息。訊息內容是 Markdown。⌘Enter 儲存。"
    :dirty="dirty"
    @save="save"
    @cancel="emit('cancel')"
  >
    <label class="hlx-chat-edit-variant">
      <span>類型</span>
      <select v-model="variant" data-field="variant" @change="onVariantChange">
        <option value="user-agent">使用者與助理</option>
        <option value="user-user">使用者之間</option>
      </select>
    </label>
    <div class="hlx-chat-edit-people">
      <div v-for="person in people" :key="person.id" class="hlx-chat-edit-person">
        <span class="hlx-chat-edit-kind">{{ kindLabel(person) }}</span>
        <input
          v-model="person.name"
          data-field="name"
          :placeholder="kindLabel(person)"
          aria-label="顯示名稱"
          autocomplete="off"
        >
        <input
          v-model="person.avatar"
          data-field="avatar"
          inputmode="url"
          placeholder="頭像網址（選填）"
          aria-label="頭像網址"
          :aria-invalid="invalid.has(person.id) || undefined"
          autocomplete="off"
          spellcheck="false"
        >
      </div>
    </div>
    <div v-for="(message, index) in messages" :key="message.key" class="hlx-chat-edit-message">
      <div class="hlx-chat-edit-head">
        <select v-model="message.participantId" :aria-label="`第 ${index + 1} 則的作者`">
          <option v-for="person in people" :key="person.id" :value="person.id">
            {{ label(person) }}
          </option>
          <option v-if="!isKnown(message.participantId)" :value="message.participantId">
            未知
          </option>
        </select>
        <button type="button" aria-label="上移" title="上移" :disabled="index === 0" @click="moveMessage(index, -1)">
          ↑
        </button>
        <button type="button" aria-label="下移" title="下移" :disabled="index === messages.length - 1" @click="moveMessage(index, 1)">
          ↓
        </button>
        <button type="button" aria-label="刪除訊息" title="刪除訊息" @click="messages.splice(index, 1)">
          ×
        </button>
      </div>
      <textarea v-model="message.content" rows="3" :aria-label="`第 ${index + 1} 則訊息`" />
    </div>
    <div>
      <button type="button" @click="addMessage">
        新增訊息
      </button>
    </div>
    <p v-if="error" class="hlx-block-dialog-error" role="alert">
      {{ error }}
    </p>
    <template #status>
      {{ messages.length }} 則訊息
    </template>
  </BlockDialog>
</template>
