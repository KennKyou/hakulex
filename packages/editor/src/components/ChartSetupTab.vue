<script setup lang="ts">
import type { ChartDraft } from '../chart/draft'
import { CHART_PALETTE_SIZE } from '@hakulex/renderer'
import { computed, nextTick, reactive, shallowRef, useId, useTemplateRef } from 'vue'
import { addSeries, choosePieSeries, dataFields, patchDraft, removeSeries, setSeriesLabel } from '../chart/draft'
import { IconClose, IconPlus } from '../chart/icons'

const props = defineProps<{ draft: ChartDraft }>()
const emit = defineEmits<{ change: [draft: ChartDraft] }>()

const TYPES = [
  { value: 'bar', label: '長條' },
  { value: 'line', label: '折線' },
  { value: 'area', label: '面積' },
  { value: 'pie', label: '圓餅' },
]
const id = useId()

interface Series { key: string, label?: string, color?: number }
const series = computed<Series[]>(() => Array.isArray(props.draft.series)
  ? props.draft.series.filter((item): item is Series => typeof item === 'object' && item !== null && typeof (item as Series).key === 'string')
  : [])
const pie = computed(() => props.draft.type === 'pie')
// The category can be any field that isn't a series.
const categories = computed(() => {
  const keys = new Set(series.value.map(item => item.key))
  return dataFields(props.draft).filter(name => name === props.draft.x || !keys.has(name))
})
function text(value: unknown) {
  return typeof value === 'string'
    ? value
    : ''
}
const nameOf = (item: Series) => item.label || item.key

/*
 * Each series shows its color on a button; the palette opens under it, one at a time, and
 * closes once a color is picked, handing the focus back to the button.
 */
const root = useTemplateRef<HTMLElement>('root')
const palette = shallowRef<number | null>(null)
// What a series without a color of its own gets: the palette in order.
const shownColor = (item: Series, index: number) => item.color ?? (index % CHART_PALETTE_SIZE) + 1
function togglePalette(index: number) {
  palette.value = palette.value === index
    ? null
    : index
}
async function pickColor(index: number, color: number | undefined) {
  setColor(index, color)
  palette.value = null
  await nextTick()
  root.value?.querySelector<HTMLElement>(`[data-field="series-swatch"][data-series="${index}"]`)?.focus()
}

function setColor(index: number, color: number | undefined) {
  const list = (props.draft.series as unknown[]).map((item, position) => {
    if (position !== index)
      return item
    const { color: _old, ...rest } = item as Series
    return color === undefined
      ? rest
      : { ...rest, color }
  })
  emit('change', { ...props.draft, series: list })
}

// Names are kept as typed until the field is left: a render resets an input to its binding,
// and the stored name is trimmed.
const editing = reactive(new Map<number, string>())
function onName(index: number, value: string) {
  editing.set(index, value)
  emit('change', setSeriesLabel(props.draft, series.value[index].key, value))
}

/**
 * A pie highlights a category and the other types a series, so a highlight that names neither
 * in the new type would gray out everything: it goes.
 */
function setType(type: string) {
  let next = patchDraft(props.draft, { type })
  const highlight = props.draft.highlight
  if (typeof highlight === 'string') {
    const names = type === 'pie'
      ? (Array.isArray(props.draft.data) && typeof props.draft.x === 'string'
          ? props.draft.data.map(row => String((row as Record<string, unknown>)?.[props.draft.x as string] ?? ''))
          : [])
      : series.value.map(item => item.key)
    if (!names.includes(highlight))
      next = patchDraft(next, { highlight: undefined })
  }
  emit('change', next)
}

function add() {
  const next = addSeries(props.draft)
  if (next)
    emit('change', next)
}

function remove(key: string) {
  const next = removeSeries(props.draft, key)
  if (next)
    emit('change', next)
}
</script>

<template>
  <div ref="root" class="hlx-chart-form">
    <div class="hlx-chart-field">
      <span :id="`${id}-type`" class="hlx-chart-label">類型</span>
      <div class="hlx-chart-segmented" role="radiogroup" aria-label="圖表類型">
        <label v-for="item in TYPES" :key="item.value" :data-checked="draft.type === item.value || undefined">
          <input
            type="radio"
            :name="`${id}-type`"
            :value="item.value"
            data-field="type"
            :checked="draft.type === item.value"
            @change="setType(item.value)"
          >
          <span>{{ item.label }}</span>
        </label>
      </div>
    </div>
    <label class="hlx-chart-field">
      <span class="hlx-chart-label">標題</span>
      <input :value="text(draft.title)" type="text" data-field="title" @input="emit('change', patchDraft(draft, { title: ($event.target as HTMLInputElement).value }))">
    </label>
    <label class="hlx-chart-field">
      <span class="hlx-chart-label">{{ pie ? '分類欄位（每一片）' : '分類欄位（x 軸）' }}</span>
      <select :value="draft.x" data-field="x" @change="emit('change', patchDraft(draft, { x: ($event.target as HTMLSelectElement).value }))">
        <option v-for="name in categories" :key="name" :value="name">{{ name }}</option>
      </select>
    </label>
    <template v-if="pie">
      <label class="hlx-chart-field">
        <span class="hlx-chart-label">數值欄位</span>
        <select :value="series[0]?.key" data-field="pie-series" @change="emit('change', choosePieSeries(draft, ($event.target as HTMLSelectElement).value))">
          <option v-for="item in series" :key="item.key" :value="item.key">{{ nameOf(item) }}</option>
        </select>
      </label>
      <p v-if="series.length > 1" class="hlx-chart-form-hint">
        圓餅圖只顯示這一個欄位。其他 {{ series.length - 1 }} 個系列會保留，換成其他圖表類型時會再出現。
      </p>
    </template>
    <fieldset v-else class="hlx-chart-series hlx-chart-field">
      <legend class="hlx-chart-label">
        系列
      </legend>
      <template v-for="(item, index) in series" :key="item.key">
        <div class="hlx-chart-series-row">
          <button
            type="button"
            class="hlx-chart-swatch-button"
            data-field="series-swatch"
            :data-series="index"
            :aria-expanded="palette === index"
            :aria-label="`系列 ${index + 1} 的顏色`"
            @click="togglePalette(index)"
          >
            <span class="hlx-chart-swatch" :class="`hlx-chart-c${shownColor(item, index)}`" />
          </button>
          <input
            :value="editing.get(index) ?? item.label ?? ''"
            type="text"
            data-field="series-label"
            :placeholder="`系列 ${index + 1}`"
            :aria-label="`系列 ${index + 1} 的名稱`"
            @input="onName(index, ($event.target as HTMLInputElement).value)"
            @change="editing.delete(index)" @blur="editing.delete(index)"
          >
          <button type="button" class="hlx-chart-icon-button" :aria-label="`刪除系列 ${index + 1}`" :disabled="series.length <= 1" @click="remove(item.key)">
            <IconClose />
          </button>
        </div>
        <div v-if="palette === index" class="hlx-chart-swatches" role="radiogroup" :aria-label="`系列 ${index + 1} 的顏色`">
          <label class="hlx-chart-swatch-choice">
            <input
              type="radio"
              :name="`${id}-color-${index}`"
              value=""
              data-field="series-color"
              :data-series="index"
              :checked="item.color === undefined"
              aria-label="自動"
              @change="pickColor(index, undefined)"
            >
            <span class="hlx-chart-swatch-auto">自動</span>
          </label>
          <label v-for="color in CHART_PALETTE_SIZE" :key="color" class="hlx-chart-swatch-choice">
            <input
              type="radio"
              :name="`${id}-color-${index}`"
              :value="String(color)"
              data-field="series-color"
              :data-series="index"
              :checked="item.color === color"
              :aria-label="`顏色 ${color}`"
              @change="pickColor(index, color)"
            >
            <span class="hlx-chart-swatch" :class="`hlx-chart-c${color}`" />
          </label>
        </div>
      </template>
      <button type="button" class="hlx-chart-wide-button" :disabled="series.length >= CHART_PALETTE_SIZE" @click="add">
        <IconPlus />新增系列
      </button>
    </fieldset>
  </div>
</template>
