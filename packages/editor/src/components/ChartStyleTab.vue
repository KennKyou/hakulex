<script setup lang="ts">
import type { ChartDraft } from '../chart/draft'
import { computed, reactive } from 'vue'
import { parseCellNumber, patchDraft, patchNested } from '../chart/draft'

const props = defineProps<{ draft: ChartDraft }>()
const emit = defineEmits<{ change: [draft: ChartDraft] }>()

type Row = Record<string, unknown>
const type = computed(() => props.draft.type)
const pie = computed(() => type.value === 'pie')
// Only what applies to the chart's type is offered.
const stackable = computed(() => type.value === 'bar' || type.value === 'area')
const TEXTS = computed(() => [
  { key: 'subtitle', label: '副標' },
  ...(pie.value
    ? []
    : [
        { key: 'xLabel', label: 'x 軸說明' },
      ]),
  { key: 'source', label: '資料來源' },
  { key: 'note', label: '註記' },
])

function nested(key: 'format' | 'y'): Row {
  return typeof props.draft[key] === 'object' && props.draft[key] !== null
    ? props.draft[key] as Row
    : {}
}
function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : ''
}
// A pie highlights a slice; the rest highlight a series.
const highlights = computed(() => {
  if (pie.value) {
    return Array.isArray(props.draft.data) && typeof props.draft.x === 'string'
      ? props.draft.data.map(row => text((row as Row)?.[props.draft.x as string])).filter(Boolean).map(name => ({ value: name, label: name }))
      : []
  }
  return Array.isArray(props.draft.series)
    ? props.draft.series.flatMap((item) => {
        const value = item as Row
        return typeof value?.key === 'string'
          ? [
              {
                value: value.key,
                label: typeof value.label === 'string' && value.label
                  ? value.label
                  : value.key,
              },
            ]
          : []
      })
    : []
})

/*
 * Number fields keep what is typed until they are left, since a render resets an input to its
 * binding. What can't be stored is marked and explained instead, and isn't written.
 */
type NumberField = 'y-min' | 'y-max' | 'decimals'
const editing = reactive(new Map<NumberField, string>())
const problems = reactive(new Map<NumberField, string>())
const stored: Record<NumberField, () => unknown> = {
  'y-min': () => nested('y').min,
  'y-max': () => nested('y').max,
  'decimals': () => nested('format').decimals,
}
const shown = (field: NumberField) => editing.get(field) ?? text(stored[field]())

function setNumber(field: NumberField, raw: string) {
  editing.set(field, raw)
  problems.delete(field)
  const value = parseCellNumber(raw)
  if (value === undefined) {
    problems.set(field, field === 'decimals'
      ? '小數位要是 0 到 10 的整數。'
      : 'y 軸的範圍要是數字。')
    return
  }
  if (field === 'decimals') {
    if (value !== null && !(Number.isInteger(value) && value >= 0 && value <= 10)) {
      problems.set(field, '小數位要是 0 到 10 的整數。')
      return
    }
    emit('change', patchNested(props.draft, 'format', { decimals: value ?? undefined }))
    return
  }
  const min = field === 'y-min'
    ? value
    : parseCellNumber(text(nested('y').min))
  const max = field === 'y-max'
    ? value
    : parseCellNumber(text(nested('y').max))
  if (typeof min === 'number' && typeof max === 'number' && min >= max) {
    problems.set(field, 'y 軸的最小值要小於最大值。')
    return
  }
  emit('change', patchNested(props.draft, 'y', { [field === 'y-min'
    ? 'min'
    : 'max']: value ?? undefined }))
}

// On change as well as blur: leaving an edited field always sends `change`, and tests showed
// `blur` sometimes not reaching here.
function leave(field: NumberField) {
  editing.delete(field)
  problems.delete(field)
}
</script>

<template>
  <div class="hlx-chart-form">
    <div class="hlx-chart-form-pair">
      <label v-for="item in TEXTS" :key="item.key">
        <span>{{ item.label }}</span>
        <input :value="text(draft[item.key])" type="text" :data-field="item.key" placeholder="選填" @input="emit('change', patchDraft(draft, { [item.key]: ($event.target as HTMLInputElement).value }))">
      </label>
    </div>
    <div class="hlx-chart-form-pair">
      <template v-if="!pie">
        <label>
          <span>y 軸最小值</span>
          <input :value="shown('y-min')" type="text" inputmode="decimal" data-field="y-min" placeholder="自動" :data-invalid="problems.has('y-min') || undefined" :aria-invalid="problems.has('y-min') || undefined" @input="setNumber('y-min', ($event.target as HTMLInputElement).value)" @change="leave('y-min')" @blur="leave('y-min')">
        </label>
        <label>
          <span>y 軸最大值</span>
          <input :value="shown('y-max')" type="text" inputmode="decimal" data-field="y-max" placeholder="自動" :data-invalid="problems.has('y-max') || undefined" :aria-invalid="problems.has('y-max') || undefined" @input="setNumber('y-max', ($event.target as HTMLInputElement).value)" @change="leave('y-max')" @blur="leave('y-max')">
        </label>
      </template>
      <label>
        <span>單位</span>
        <input :value="text(nested('format').unit)" type="text" data-field="unit" placeholder="例如 %、ms、$" @input="emit('change', patchNested(draft, 'format', { unit: ($event.target as HTMLInputElement).value }))">
      </label>
      <label>
        <span>小數位</span>
        <input :value="shown('decimals')" type="text" inputmode="numeric" data-field="decimals" placeholder="自動" :data-invalid="problems.has('decimals') || undefined" :aria-invalid="problems.has('decimals') || undefined" @input="setNumber('decimals', ($event.target as HTMLInputElement).value)" @change="leave('decimals')" @blur="leave('decimals')">
      </label>
    </div>
    <p v-if="problems.size" class="hlx-chart-form-error" role="alert">
      {{ [...problems.values()].join(' ') }}
    </p>
    <label class="hlx-chart-form-check">
      <input :checked="nested('format').compact !== false" type="checkbox" data-field="compact" @change="emit('change', patchNested(draft, 'format', { compact: ($event.target as HTMLInputElement).checked ? undefined : false }))">
      <span>縮寫大數字（例如 1.2k、3.4M）</span>
    </label>
    <label>
      <span>{{ pie ? '強調一片' : '強調系列' }}</span>
      <select :value="text(draft.highlight)" data-field="highlight" @change="emit('change', patchDraft(draft, { highlight: ($event.target as HTMLSelectElement).value }))">
        <option value="">
          不強調
        </option>
        <option v-for="item in highlights" :key="item.value" :value="item.value">{{ item.label }}</option>
      </select>
    </label>
    <label v-if="stackable" class="hlx-chart-form-check">
      <input :checked="draft.stacked === true" type="checkbox" data-field="stacked" @change="emit('change', patchDraft(draft, { stacked: ($event.target as HTMLInputElement).checked || undefined }))">
      <span>堆疊</span>
    </label>
    <label v-if="pie" class="hlx-chart-form-check">
      <input :checked="draft.donut === true" type="checkbox" data-field="donut" @change="emit('change', patchDraft(draft, { donut: ($event.target as HTMLInputElement).checked || undefined }))">
      <span>甜甜圈</span>
    </label>
  </div>
</template>
