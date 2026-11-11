<script setup lang="ts">
import type { BlockFields } from '../plugins/ContentBlockPlugin'
import { dynamicUrlStatus, normalizeDynamic } from '@hakulex/renderer'
import { shallowRef } from 'vue'

/*
 * A dynamic block's address, height and props, beside it. The address goes in once entered,
 * since a half-typed one would start loading; the others as they are typed, when they are whole.
 */

const props = defineProps<{ fields: BlockFields }>()
const emit = defineEmits<{ write: [patch: BlockFields, field?: string], endTyping: [] }>()

const start = normalizeDynamic(props.fields)
const url = shallowRef(typeof props.fields.url === 'string'
  ? props.fields.url
  : '')
const height = shallowRef(String(start.initialHeight))
const propsText = shallowRef(JSON.stringify(start.props, null, 2))
const error = shallowRef<{ field: string, message: string } | null>(null)

const invalid = (field: string) => error.value?.field === field || undefined
function settle(field: string, message: string | null) {
  if (message)
    error.value = { field, message }
  else if (error.value?.field === field)
    error.value = null
  return !message
}

function onUrl() {
  const value = url.value.trim()
  // Whether the site lets it load is the block's to say; here, only whether it is an address.
  if (!settle('url', value && dynamicUrlStatus(value, location.href, () => true) === 'unsafe'
    ? '網址要是 http(s) 或這個網站的路徑'
    : null)) {
    return
  }
  emit('write', { url: value })
}

function onHeight() {
  const value = height.value.trim()
  const number = Number(value)
  if (settle('initialHeight', /^\d+$/.test(value) && number >= 1 && number <= 4000
    ? null
    : '初始高度要是 1 到 4000 的整數')) {
    emit('write', { initialHeight: number }, 'initialHeight')
  }
}

function onProps() {
  let parsed: unknown
  try {
    parsed = JSON.parse(propsText.value)
  }
  catch {
    parsed = null
  }
  const whole = !!parsed && typeof parsed === 'object' && !Array.isArray(parsed)
  if (settle('props', whole ? null : 'props 要是 JSON 物件'))
    emit('write', { props: parsed as Record<string, unknown> }, 'props')
}
</script>

<template>
  <label class="hlx-chart-field">
    <span>模組網址</span>
    <input
      v-model="url"
      type="text"
      inputmode="url"
      autocomplete="off"
      spellcheck="false"
      placeholder="/widgets/counter.js"
      data-field="url"
      :aria-invalid="invalid('url')"
      @change="onUrl"
      @keydown.enter.prevent="onUrl"
    >
  </label>
  <label class="hlx-chart-field">
    <span>初始高度（px）</span>
    <input
      v-model="height"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      data-field="initialHeight"
      :aria-invalid="invalid('initialHeight')"
      @input="onHeight"
      @focusout="emit('endTyping')"
    >
  </label>
  <label class="hlx-chart-field">
    <span>props（JSON）</span>
    <textarea
      v-model="propsText"
      class="hlx-dynamic-props"
      rows="5"
      spellcheck="false"
      data-field="props"
      :aria-invalid="invalid('props')"
      @input="onProps"
      @focusout="emit('endTyping')"
    />
  </label>
  <p v-if="error" class="hlx-block-panel-error" role="alert">
    {{ error.message }}
  </p>
</template>
