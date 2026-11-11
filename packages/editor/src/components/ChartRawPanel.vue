<script setup lang="ts">
import { parseChartSource } from '@hakulex/renderer'
import { useLexicalComposer } from '@hakulex/vue-lexical'
import { $addUpdateTag, $getNodeByKey, HISTORY_PUSH_TAG } from 'lexical'
import { computed, nextTick, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { IconCode, IconCopy } from '../chart/icons'
import { $isChartNode } from '../nodes/ChartNode'

const props = defineProps<{ nodeKey: string, spec: unknown }>()
const emit = defineEmits<{ close: [] }>()

const editor = useLexicalComposer()

/** Indented to be read, however it is stored. */
function pretty(spec: unknown) {
  if (typeof spec !== 'string')
    return ''
  try {
    return JSON.stringify(JSON.parse(spec), null, 2)
  }
  catch {
    return spec
  }
}

const text = shallowRef(pretty(props.spec))
// An undo or the form changing the chart shows here too.
watch(() => props.spec, (spec) => {
  text.value = pretty(spec)
})
const result = computed(() => parseChartSource(text.value))
const changed = computed(() => text.value !== pretty(props.spec))

const area = useTemplateRef<HTMLTextAreaElement>('area')
onMounted(async () => {
  await nextTick()
  area.value?.focus({ preventScroll: true })
})

const copied = shallowRef(false)
async function copy() {
  if (typeof props.spec !== 'string' || !navigator.clipboard)
    return
  await navigator.clipboard.writeText(props.spec)
  copied.value = true
}

function apply() {
  if (!result.value.ok || !changed.value)
    return
  const spec = JSON.stringify(JSON.parse(text.value), null, 2)
  editor.update(() => {
    const node = $getNodeByKey(props.nodeKey)
    if (!$isChartNode(node))
      return
    $addUpdateTag(HISTORY_PUSH_TAG)
    node.setFields({ spec })
  })
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('close')
  }
  else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    apply()
  }
}
</script>

<template>
  <div class="hlx-chart-raw" role="dialog" aria-label="原始資料" @keydown="onKeydown">
    <div class="hlx-chart-panel-head">
      <IconCode />
      <span class="hlx-chart-panel-title">原始資料</span>
      <span v-if="copied" class="hlx-chart-form-hint" role="status">已複製</span>
      <button type="button" class="hlx-chart-head-button" @click="copy">
        <IconCopy />複製
      </button>
    </div>
    <div class="hlx-chart-panel-body">
      <textarea
        ref="area"
        v-model="text"
        class="hlx-chart-source"
        data-field="spec"
        spellcheck="false"
        aria-label="圖表規格（JSON）"
        :aria-invalid="!result.ok || undefined"
        @input="copied = false"
      />
      <ul v-if="!result.ok" class="hlx-chart-problems" role="alert">
        <li v-for="(issue, index) in result.issues" :key="index">
          <code>{{ issue.path }}</code> {{ issue.message }}<template v-if="issue.hint">
            （{{ issue.hint }}）
          </template>
        </li>
      </ul>
      <div class="hlx-chart-raw-actions">
        <button type="button" data-primary :disabled="!result.ok || !changed" title="⌘Enter" @click="apply">
          套用
        </button>
      </div>
    </div>
  </div>
</template>
