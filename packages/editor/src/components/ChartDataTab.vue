<script setup lang="ts">
import type { ChartDraft, PastedTable } from '../chart/draft'
import { CHART_PALETTE_SIZE } from '@hakulex/renderer'
import { computed, reactive, shallowRef } from 'vue'
import { addRow, addSeries, pasteTable, removeRow, setCategoryLabel, setCell, setSeriesLabel } from '../chart/draft'
import { IconClose, IconPlus } from '../chart/icons'

const props = defineProps<{ draft: ChartDraft }>()
const emit = defineEmits<{ change: [draft: ChartDraft] }>()

type Row = Record<string, unknown>
const rows = computed<Row[]>(() => Array.isArray(props.draft.data)
  ? props.draft.data.filter((row): row is Row => typeof row === 'object' && row !== null)
  : [])
interface Column { key: string, name: string, category: boolean }
// The category first, then a column per series: what the chart draws. A pie draws one.
const columns = computed<Column[]>(() => {
  const series = Array.isArray(props.draft.series)
    ? props.draft.series.flatMap((item) => {
        const value = item as Row
        return typeof value === 'object' && value !== null && typeof value.key === 'string'
          ? [
              {
                key: value.key,
                name: typeof value.label === 'string' && value.label
                  ? value.label
                  : value.key,
                category: false,
              },
            ]
          : []
      })
    : []
  const shown = props.draft.type === 'pie'
    ? series.slice(0, 1)
    : series
  if (typeof props.draft.x !== 'string')
    return shown
  const name = typeof props.draft.xLabel === 'string' && props.draft.xLabel
    ? props.draft.xLabel
    : props.draft.x
  return [
    { key: props.draft.x, name, category: true },
    ...shown,
  ]
})
// A pie draws one series, so more can't be added here; the setup tab says so.
const canAddSeries = computed(() => props.draft.type !== 'pie'
  && (Array.isArray(props.draft.series)
    ? props.draft.series.length
    : 0) < CHART_PALETTE_SIZE)
function onAddSeries() {
  const next = addSeries(props.draft)
  if (next)
    emit('change', next)
}

function shown(value: unknown) {
  return value === null || value === undefined
    ? ''
    : String(value)
}

/*
 * What the author is typing, by input, until they leave it. Vue sets an input's value from
 * its binding on every render, so without this a render mid-edit would wipe the text.
 */
const editing = reactive(new Map<string, string>())
const invalid = shallowRef(new Set<string>())
const pasted = shallowRef<Pick<PastedTable, 'issues' | 'dropped'> | null>(null)
const cellId = (row: number, key: string) => `cell:${row}:${key}`
const headerId = (key: string) => `header:${key}`

function mark(id: string, on: boolean) {
  const marks = new Set(invalid.value)
  if (on)
    marks.add(id)
  else
    marks.delete(id)
  invalid.value = marks
}

function onCell(row: number, key: string, event: Event) {
  const text = (event.target as HTMLInputElement).value
  editing.set(cellId(row, key), text)
  const next = setCell(props.draft, row, key, text)
  mark(cellId(row, key), !next)
  if (next)
    emit('change', next)
}

// What isn't a number isn't kept: leaving the cell shows what is stored again.
function onLeave(row: number, key: string) {
  editing.delete(cellId(row, key))
  mark(cellId(row, key), false)
}

// A column's name is what readers see: a series' label, or for the category, the axis label.
// The field in every row keeps its name.
function onHeader(column: Column) {
  const text = editing.get(headerId(column.key))
  editing.delete(headerId(column.key))
  if (text === undefined || text.trim() === column.name)
    return
  emit('change', column.category
    ? setCategoryLabel(props.draft, text)
    : setSeriesLabel(props.draft, column.key, text))
}

function onPaste(event: ClipboardEvent) {
  const result = pasteTable(props.draft, event.clipboardData?.getData('text/plain') ?? '')
  if (!result)
    return
  event.preventDefault()
  invalid.value = new Set()
  editing.clear()
  pasted.value = { issues: result.issues, dropped: result.dropped }
  emit('change', result.draft)
}
</script>

<template>
  <div class="hlx-chart-data" @paste="onPaste">
    <div class="hlx-chart-data-frame">
      <table>
        <thead>
          <tr>
            <th v-for="column in columns" :key="column.key" scope="col" :data-category="column.category || undefined">
              <span v-if="column.category" class="hlx-chart-category-mark">分類</span>
              <input
                :value="editing.get(headerId(column.key)) ?? column.name"
                type="text"
                data-field="header"
                :data-key="column.key"
                :aria-label="column.category ? `分類欄的名稱` : `欄名 ${column.name}`"
                @input="editing.set(headerId(column.key), ($event.target as HTMLInputElement).value)"
                @change="onHeader(column)"
                @blur="onHeader(column)"
              >
            </th>
            <th scope="col">
              <span class="hlx-visually-hidden">操作</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="index">
            <td v-for="{ key } in columns" :key="key" :data-category="key === draft.x || undefined">
              <input
                :value="editing.get(cellId(index, key)) ?? shown(row[key])"
                type="text"
                :inputmode="key === draft.x ? undefined : 'decimal'"
                data-field="cell"
                :data-row="index"
                :data-key="key"
                :data-invalid="invalid.has(cellId(index, key)) || undefined"
                :aria-invalid="invalid.has(cellId(index, key)) || undefined"
                :aria-label="`第 ${index + 1} 列 ${key}`"
                @input="onCell(index, key, $event)"
                @change="onLeave(index, key)" @blur="onLeave(index, key)"
              >
            </td>
            <td>
              <button type="button" class="hlx-chart-icon-button" :aria-label="`刪除第 ${index + 1} 列`" @click="emit('change', removeRow(draft, index))">
                <IconClose />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="hlx-chart-data-actions">
      <button type="button" @click="emit('change', addRow(draft))">
        <IconPlus />新增一列
      </button>
      <button v-if="draft.type !== 'pie'" type="button" :disabled="!canAddSeries" @click="onAddSeries">
        <IconPlus />新增系列
      </button>
    </div>
    <p class="hlx-chart-form-hint">
      可以直接貼上從試算表複製的資料：第一列是欄名，第一欄是分類。
    </p>
    <div v-if="pasted && (pasted.issues.length || pasted.dropped)" role="status" class="hlx-chart-form-hint">
      <p v-if="pasted.dropped">
        最多 6 個系列，另外 {{ pasted.dropped }} 欄沒有貼上。
      </p>
      <p v-for="(issue, index) in pasted.issues" :key="index">
        第 {{ issue.row + 1 }} 列 {{ issue.column }}：「{{ issue.value }}」不是數字，已留空。
      </p>
    </div>
  </div>
</template>
