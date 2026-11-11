<script setup lang="ts">
import type { BlockFields } from '../plugins/ContentBlockPlugin'
import { isSafeImageSrc, parseHttpUrl } from '@hakulex/renderer'
import { reactive, shallowRef } from 'vue'

/*
 * A link card's fields, beside it. The title and description go in as they are typed; the
 * addresses only once entered, and only if they can be used. A blank field leaves the card.
 */

const props = defineProps<{ fields: BlockFields }>()
const emit = defineEmits<{ write: [patch: BlockFields, field?: string], endTyping: [] }>()

const FIELDS = [
  { name: 'url', label: '網址', kind: 'link' },
  { name: 'title', label: '標題', kind: 'text' },
  { name: 'description', label: '描述', kind: 'text' },
  { name: 'favicon', label: '圖示網址', kind: 'picture' },
  { name: 'image', label: '圖片網址', kind: 'picture' },
] as const
type Field = (typeof FIELDS)[number]

// Stored values can be anything; only text can be edited here.
function stored(name: string) {
  return typeof props.fields[name] === 'string'
    ? props.fields[name] as string
    : ''
}
const draft = reactive(Object.fromEntries(FIELDS.map(({ name }) => [
  name,
  stored(name),
]))) as Record<string, string>
const error = shallowRef<{ field: string, message: string } | null>(null)

function problem(field: Field, value: string): string | null {
  if (field.kind === 'link') {
    if (!value)
      return '請輸入網址'
    if (!parseHttpUrl(value))
      return '網址要以 http 或 https 開頭'
  }
  if (field.kind === 'picture' && value && !isSafeImageSrc(value))
    return `${field.label}無法使用`
  return null
}

function onInput(field: Field) {
  if (field.kind !== 'text')
    return
  if (error.value?.field === field.name)
    error.value = null
  emit('write', { [field.name]: draft[field.name].trim() || undefined }, field.name)
}

function onChange(field: Field) {
  if (field.kind === 'text')
    return
  const value = draft[field.name].trim()
  const message = problem(field, value)
  if (message) {
    error.value = { field: field.name, message }
    return
  }
  if (error.value?.field === field.name)
    error.value = null
  if (value !== stored(field.name).trim())
    emit('write', { [field.name]: value || undefined })
}
</script>

<template>
  <label v-for="field in FIELDS" :key="field.name" class="hlx-chart-field">
    <span>{{ field.label }}</span>
    <input
      v-model="draft[field.name]"
      type="text"
      :inputmode="field.kind === 'text' ? undefined : 'url'"
      autocomplete="off"
      :spellcheck="field.kind === 'text' ? undefined : 'false'"
      :data-field="field.name"
      :aria-invalid="error?.field === field.name || undefined"
      @input="onInput(field)"
      @change="onChange(field)"
      @keydown.enter.prevent="onChange(field)"
      @focusout="emit('endTyping')"
    >
  </label>
  <p v-if="error" class="hlx-block-panel-error" role="alert">
    {{ error.message }}
  </p>
</template>
