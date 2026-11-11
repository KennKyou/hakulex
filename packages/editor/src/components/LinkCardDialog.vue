<script setup lang="ts">
import type { BlockFields } from '../plugins/ContentBlockPlugin'
import { isSafeImageSrc, parseHttpUrl } from '@hakulex/renderer'
import { computed, reactive, shallowRef } from 'vue'
import BlockDialog from './BlockDialog.vue'

// Only adds a card: one in the document is edited in the panel beside it.
const emit = defineEmits<{ save: [fields: BlockFields, unchanged: boolean], cancel: [] }>()

const FIELDS = [
  { name: 'url', label: '網址', type: 'url' },
  { name: 'title', label: '標題', type: 'text' },
  { name: 'description', label: '描述', type: 'text' },
  { name: 'favicon', label: '圖示網址', type: 'url' },
  { name: 'image', label: '圖片網址', type: 'url' },
] as const
type Field = (typeof FIELDS)[number]['name']

const draft = reactive(Object.fromEntries(FIELDS.map(({ name }) => [name, '']))) as Record<Field, string>
const error = shallowRef<string | null>(null)
const dirty = computed(() => FIELDS.some(({ name }) => draft[name].trim() !== ''))

function problem(): string | null {
  const url = draft.url.trim()
  if (!url)
    return '請輸入網址'
  if (!parseHttpUrl(url))
    return '網址要以 http 或 https 開頭'
  for (const { name, label } of FIELDS.slice(3)) {
    const value = draft[name].trim()
    if (value && !isSafeImageSrc(value))
      return `${label}無法使用`
  }
  return null
}

function save() {
  error.value = problem()
  if (error.value)
    return
  // Blank fields stay out of the document.
  const fields: BlockFields = {}
  for (const { name } of FIELDS) {
    if (draft[name].trim())
      fields[name] = draft[name].trim()
  }
  emit('save', fields, !dirty.value)
}
</script>

<template>
  <BlockDialog
    title="插入連結卡片"
    description="填寫連結和要顯示的內容。⌘Enter 儲存。"
    :dirty="dirty"
    @save="save"
    @cancel="emit('cancel')"
  >
    <div class="hlx-link-card-fields">
      <label v-for="field in FIELDS" :key="field.name">
        <span>{{ field.label }}</span>
        <input
          v-model="draft[field.name]"
          :type="field.type === 'url' ? 'text' : field.type"
          :inputmode="field.type === 'url' ? 'url' : undefined"
          :data-field="field.name"
          @input="error = null"
        >
      </label>
    </div>
    <template #status>
      <span v-if="error" role="alert">{{ error }}</span>
    </template>
  </BlockDialog>
</template>
