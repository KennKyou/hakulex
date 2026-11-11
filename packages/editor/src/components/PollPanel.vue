<script setup lang="ts">
import type { PollShowResults } from '@hakulex/renderer'
import type { BlockFields } from '../plugins/ContentBlockPlugin'
import { normalizePoll } from '@hakulex/renderer'
import { computed, ref, shallowRef } from 'vue'
import { createPollId } from '../nodes/poll-id'

/*
 * A poll's question, options and settings, beside it. Each change goes in as it is made,
 * as long as the poll is still whole: a question and two options with text.
 */

const props = defineProps<{
  fields: BlockFields
  /** Added in this editor just now, so there are no votes to warn about. */
  fresh?: boolean
}>()
const emit = defineEmits<{ write: [patch: BlockFields, field?: string], endTyping: [] }>()

// What the poll was when the panel opened: the warnings are about votes cast against it.
const start = normalizePoll(props.fields)
const startCloseAt = props.fields.closeAt

/** A `datetime-local` value, in the author's time zone, for an ISO time. */
function localTime(iso: string | undefined) {
  if (!iso)
    return ''
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

interface Row {
  /** Every row has one, so its votes and its step of typing stay its own. */
  id: string
  label: string
}

const question = shallowRef(start?.question ?? '')
const rows = ref<Row[]>(start?.options.length
  ? start.options.map(option => ({ ...option }))
  : [
      {
        id: createPollId('o'),
        label: '',
      },
      {
        id: createPollId('o'),
        label: '',
      },
    ])
const mode = shallowRef(start?.mode ?? 'single')
const closeAt = shallowRef(localTime(start?.closeAt))
const showResults = shallowRef<PollShowResults>(start?.showResults ?? 'always')
const error = shallowRef<string | null>(null)

// Votes are counted by option id and checked against the mode, so these can leave old votes behind.
const warning = computed(() => {
  if (!start || props.fresh)
    return null
  const kept = new Set(rows.value.map(row => row.id))
  if (start.options.some(option => !kept.has(option.id)))
    return '刪除選項後，已經投給它的票數會對不上。'
  if (mode.value !== start.mode)
    return '切換單選和多選後，已經投過的票數可能對不上。'
  return null
})

function problem(): string | null {
  if (!question.value.trim())
    return '請輸入題目'
  if (rows.value.filter(row => row.label.trim()).length < 2)
    return '至少要有兩個選項'
  if (closeAt.value && Number.isNaN(new Date(closeAt.value).getTime()))
    return '截止時間格式不對'
  return null
}

/** Writes the poll as the panel has it, if it is whole; `field` joins typing in one place. */
function write(field?: string) {
  error.value = problem()
  if (error.value)
    return
  emit('write', {
    question: question.value.trim(),
    options: rows.value
      .filter(row => row.label.trim())
      .map(row => ({
        id: row.id,
        label: row.label.trim(),
      })),
    mode: mode.value,
    // A closing time that wasn't touched keeps its stored form.
    closeAt: closeAt.value === localTime(start?.closeAt)
      ? startCloseAt
      : closeAt.value
        ? new Date(closeAt.value).toISOString()
        : undefined,
    // The default needn't be stored, but one that was stays as written.
    showResults: showResults.value === 'always' && !props.fields.showResults
      ? undefined
      : showResults.value,
  }, field)
}

function move(index: number, by: number) {
  const target = index + by
  if (target < 0 || target >= rows.value.length)
    return
  const next = [...rows.value]
  ;[next[index], next[target]] = [next[target], next[index]]
  rows.value = next
  write()
}

function remove(index: number) {
  rows.value.splice(index, 1)
  write()
}
</script>

<template>
  <label class="hlx-chart-field">
    <span>題目</span>
    <input
      v-model="question"
      type="text"
      data-field="question"
      data-autofocus
      data-select
      :aria-invalid="error === '請輸入題目' || undefined"
      @input="write('question')"
      @focusout="emit('endTyping')"
    >
  </label>
  <fieldset class="hlx-poll-option-list">
    <legend class="hlx-chart-label">
      選項
    </legend>
    <div v-for="(row, index) in rows" :key="row.id" class="hlx-poll-option-row">
      <input
        v-model="row.label"
        type="text"
        data-field="option"
        :aria-label="`選項 ${index + 1}`"
        @input="write(`option:${row.id}`)"
        @focusout="emit('endTyping')"
      >
      <button type="button" class="hlx-chart-icon-button" aria-label="上移" :disabled="index === 0" @click="move(index, -1)">
        ↑
      </button>
      <button type="button" class="hlx-chart-icon-button" aria-label="下移" :disabled="index === rows.length - 1" @click="move(index, 1)">
        ↓
      </button>
      <button type="button" class="hlx-chart-icon-button" aria-label="刪除選項" :disabled="rows.length <= 2" @click="remove(index)">
        ×
      </button>
    </div>
    <button type="button" class="hlx-chart-wide-button" @click="rows.push({ id: createPollId('o'), label: '' })">
      新增選項
    </button>
  </fieldset>
  <div class="hlx-chart-form-pair">
    <label>
      <span>投票方式</span>
      <select v-model="mode" data-field="mode" @change="write()">
        <option value="single">單選</option>
        <option value="multiple">可複選</option>
      </select>
    </label>
    <label>
      <span>顯示結果</span>
      <select v-model="showResults" data-field="showResults" @change="write()">
        <option value="always">一律顯示</option>
        <option value="after-vote">投票後</option>
        <option value="after-close">截止後</option>
      </select>
    </label>
  </div>
  <label class="hlx-chart-field">
    <span>截止時間</span>
    <input v-model="closeAt" type="datetime-local" data-field="closeAt" @change="write()">
  </label>
  <p v-if="error" class="hlx-block-panel-error" role="alert">
    {{ error }}
  </p>
  <p v-else-if="warning" class="hlx-block-panel-status" role="status">
    {{ warning }}
  </p>
</template>
