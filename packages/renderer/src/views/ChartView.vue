<script setup lang="ts">
import type { ChartHover } from '../chart/hover'
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { formatChartValue } from '../chart/format'
import { chartHover, nearestCategory, sliceAt } from '../chart/hover'
import { parseChartSource } from '../chart/spec'
import { chartLegend, COMPACT_LAYOUT, layoutChart, renderChartSvg, WIDE_LAYOUT } from '../chart/svg'
import { chartTable } from '../chart/table'
import ChartErrorCard from './ChartErrorCard.vue'
import ChartTooltip from './ChartTooltip.vue'

const props = withDefaults(defineProps<{
  spec: unknown
  /** Whether the chart has its own button for the data; the editor puts one on its toolbar. */
  toggle?: boolean
}>(), { toggle: true })
/** The chart or its data as a table. Server output always starts on the chart. */
const view = defineModel<'chart' | 'table'>('view', { default: 'chart' })

const parsed = computed(() => parseChartSource(props.spec))
function text(value: unknown) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : undefined
}
const empty = computed(() => parsed.value.ok && parsed.value.spec.data.length === 0)
const showTable = computed(() => !empty.value && view.value === 'table')
const caption = computed(() => parsed.value.ok && !!(text(parsed.value.spec.title) || text(parsed.value.spec.subtitle)))
const table = computed(() => parsed.value.ok
  ? chartTable(parsed.value.spec)
  : null)
const format = computed(() => parsed.value.ok && typeof parsed.value.spec.format === 'object'
  ? parsed.value.spec.format
  : {})
const label = computed(() => parsed.value.ok
  ? text(parsed.value.spec.title) ?? '圖表'
  : '')
const legend = computed(() => parsed.value.ok
  ? chartLegend(parsed.value.spec)
  : [])

/*
 * Details on hover. Only in the browser, after the pointer or keyboard asks: server output
 * and hydration stay as they were. `hover` is a category, or for a pie, a data row.
 */
const plot = useTemplateRef<HTMLElement>('plot')
const hover = shallowRef<number | null>(null)
// Which drawing shows depends on the space, so measure the one on screen.
const size = shallowRef(WIDE_LAYOUT)
let pinned = false
// The drawing goes away with the table, and what it pointed at with it.
watch(() => view.value, () => {
  hover.value = null
  pinned = false
})

function shownSize() {
  const compact = plot.value?.querySelector('svg[data-size="compact"]')
  const wide = plot.value?.querySelector('svg[data-size="wide"]')
  return !wide?.getBoundingClientRect().width && compact?.getBoundingClientRect().width
    ? COMPACT_LAYOUT
    : WIDE_LAYOUT
}

const layout = computed(() => parsed.value.ok
  ? layoutChart(parsed.value.spec, size.value)
  : null)
const details = computed<ChartHover | null>(() => parsed.value.ok && layout.value && hover.value !== null
  ? chartHover(parsed.value.spec, layout.value, hover.value)
  : null)
// A donut shows the slice in its middle, so it needs no tip.
const showTip = computed(() => !!details.value && !(parsed.value.ok && parsed.value.spec.type === 'pie' && parsed.value.spec.donut))
const spoken = computed(() => details.value
  ? [
      details.value.title,
      ...details.value.rows.map(row => `${row.label} ${row.value}${row.percent === undefined
        ? ''
        : ` ${row.percent}%`}`),
      details.value.total
        ? `總計 ${details.value.total}`
        : '',
    ].filter(Boolean).join('，')
  : '')

// Worked out from where the pointer is, not from the element under it: WebKit gives SVG pointer
// events to the svg itself, whichever slice or label is under the pointer.
function pointAt(event: PointerEvent) {
  if (!parsed.value.ok)
    return
  size.value = shownSize()
  const svg = plot.value?.querySelector<SVGSVGElement>(`svg[data-size="${size.value.compact ? 'compact' : 'wide'}"]`)
  const rect = svg?.getBoundingClientRect()
  if (!rect?.width || !layout.value)
    return
  const x = (event.clientX - rect.left) * size.value.width / rect.width
  const y = (event.clientY - rect.top) * size.value.height / rect.height
  hover.value = parsed.value.spec.type === 'pie'
    ? sliceAt(layout.value, x, y)
    : nearestCategory(layout.value, x)
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType !== 'touch')
    return
  pinned = true
  pointAt(event)
}

function onLeave() {
  if (!pinned)
    hover.value = null
}

// A tap elsewhere puts away a tip a tap showed.
function onDocumentDown(event: Event) {
  if (pinned && !plot.value?.contains(event.target as Node)) {
    pinned = false
    hover.value = null
  }
}
onMounted(() => document.addEventListener('pointerdown', onDocumentDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentDown))

function onKeydown(event: KeyboardEvent) {
  if (!parsed.value.ok)
    return
  if (event.key === 'Escape') {
    hover.value = null
    return
  }
  const step = event.key === 'ArrowRight' || event.key === 'ArrowDown'
    ? 1
    : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
      ? -1
      : 0
  if (!step)
    return
  event.preventDefault()
  size.value = shownSize()
  // A pie can leave out empty rows: step through the slices it drew.
  const rows = parsed.value.spec.type === 'pie'
    ? layout.value?.slices.map(slice => slice.row) ?? []
    : parsed.value.spec.data.map((_, index) => index)
  if (!rows.length)
    return
  const at = hover.value === null
    ? -1
    : rows.indexOf(hover.value)
  const next = at === -1
    ? (step > 0
        ? 0
        : rows.length - 1)
    : (at + step + rows.length) % rows.length
  hover.value = rows[next]
}

// Built from the layout in code: easier than a template for SVG.
function Wide() {
  return parsed.value.ok
    ? renderChartSvg(parsed.value.spec, WIDE_LAYOUT, label.value, size.value === WIDE_LAYOUT
        ? hover.value
        : null)
    : null
}
function Compact() {
  return parsed.value.ok
    ? renderChartSvg(parsed.value.spec, COMPACT_LAYOUT, label.value, size.value === COMPACT_LAYOUT
        ? hover.value
        : null)
    : null
}

function cell(value: unknown, index: number) {
  return index === 0 || typeof value !== 'number'
    ? (value === null || value === undefined
        ? '—'
        : String(value))
    : formatChartValue(value, format.value)
}
</script>

<template>
  <ChartErrorCard v-if="!parsed.ok" :issues="parsed.issues" />
  <figure
    v-else
    class="hlx-chart"
    :data-type="parsed.spec.type"
    :data-toggle="(toggle && !empty) || undefined"
    :data-captioned="caption || undefined"
  >
    <figcaption v-if="caption" class="hlx-chart-caption">
      <span v-if="text(parsed.spec.title)" class="hlx-chart-title">{{ text(parsed.spec.title) }}</span>
      <span v-if="text(parsed.spec.subtitle)" class="hlx-chart-subtitle">{{ text(parsed.spec.subtitle) }}</span>
    </figcaption>
    <button
      v-if="toggle && !empty"
      type="button"
      class="hlx-chart-toggle"
      :aria-pressed="showTable"
      @click="view = showTable ? 'chart' : 'table'"
    >
      {{ showTable ? '檢視圖表' : '檢視資料' }}
    </button>
    <p v-if="empty" class="hlx-chart-empty">
      還沒有資料
    </p>
    <template v-else>
      <div
        v-if="!showTable"
        ref="plot"
        class="hlx-chart-plot"
        tabindex="0"
        aria-label="圖表數值，用方向鍵逐一查看"
        @pointermove="pointAt"
        @pointerdown="onPointerDown"
        @pointerleave="onLeave"
        @keydown="onKeydown"
        @blur="hover = null"
      >
        <Wide />
        <Compact />
        <ChartTooltip v-if="showTip && details" :hover="details" :width="size.width" />
        <div class="hlx-visually-hidden" aria-live="polite">
          {{ spoken }}
        </div>
      </div>
      <ul v-if="!showTable && legend.length > 1" class="hlx-chart-legend">
        <li v-for="(item, index) in legend" :key="index" :data-muted="item.muted || undefined">
          <span class="hlx-chart-swatch" :class="`hlx-chart-c${item.color}`" aria-hidden="true" />{{ item.label }}
        </li>
      </ul>
      <table class="hlx-chart-table" :class="{ 'hlx-visually-hidden': !showTable }">
        <thead>
          <tr>
            <th v-for="(column, index) in table!.columns" :key="index" scope="col">
              {{ column }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in table!.rows" :key="rowIndex">
            <td v-for="(value, index) in row" :key="index">
              {{ cell(value, index) }}
            </td>
          </tr>
        </tbody>
      </table>
    </template>
    <p v-if="text(parsed.spec.source) || text(parsed.spec.note)" class="hlx-chart-footer">
      <span v-if="text(parsed.spec.note)">{{ text(parsed.spec.note) }}</span>
      <span v-if="text(parsed.spec.source)">資料來源：{{ text(parsed.spec.source) }}</span>
    </p>
  </figure>
</template>
