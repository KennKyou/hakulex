<script setup lang="ts">
import type { ChartDraft } from '../chart/draft'
import { useLexicalComposer } from '@hakulex/vue-lexical'
import { $addUpdateTag, $getNodeByKey, HISTORY_MERGE_TAG, HISTORY_PUSH_TAG } from 'lexical'
import { computed, nextTick, onMounted, shallowRef, useTemplateRef } from 'vue'
import { parseChartDraft, serializeChartDraft } from '../chart/draft'
import { IconChart } from '../chart/icons'
import { $isChartNode } from '../nodes/ChartNode'
import ChartDataTab from './ChartDataTab.vue'
import ChartSetupTab from './ChartSetupTab.vue'
import ChartStyleTab from './ChartStyleTab.vue'

const props = defineProps<{ nodeKey: string, spec: unknown }>()
const emit = defineEmits<{ close: [] }>()

const editor = useLexicalComposer()

// The form works on what the document holds, so an undo shows in it straight away.
const draft = computed(() => typeof props.spec === 'string'
  ? parseChartDraft(props.spec)
  : null)

type Tab = 'setup' | 'data' | 'style'
const TABS: { id: Tab, label: string }[] = [
  { id: 'setup', label: '設定' },
  { id: 'data', label: '資料' },
  { id: 'style', label: '樣式' },
]
const tab = shallowRef<Tab>('setup')

const root = useTemplateRef<HTMLElement>('root')
onMounted(async () => {
  await nextTick()
  root.value?.querySelector<HTMLElement>('[role="tab"]:not(:disabled)')?.focus({ preventScroll: true })
})

/*
 * Every edit goes into the document at once. Typing in one field is one undo step however
 * many keys it takes: the first change starts a step, the rest while that field keeps the
 * focus join it. Leaving the field, or any other kind of change, starts the next one.
 */
let typingIn: Element | null = null
function isTyping(element: Element | null) {
  return element instanceof HTMLTextAreaElement
    || (element instanceof HTMLInputElement && (element.type === 'text' || element.type === 'search'))
}

function write(next: ChartDraft) {
  if (typeof props.spec === 'string') {
    try {
      if (JSON.stringify(JSON.parse(props.spec)) === JSON.stringify(next))
        return
    }
    catch {}
  }
  const active = document.activeElement
  const join = typingIn !== null && active === typingIn
  editor.update(() => {
    const node = $getNodeByKey(props.nodeKey)
    if (!$isChartNode(node))
      return
    $addUpdateTag(join
      ? HISTORY_MERGE_TAG
      : HISTORY_PUSH_TAG)
    node.setFields({
      spec: serializeChartDraft(next),
    })
  })
  typingIn = isTyping(active) && root.value?.contains(active)
    ? active
    : null
}

function onFocusOut() {
  typingIn = null
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape')
    return
  event.preventDefault()
  event.stopPropagation()
  emit('close')
}
</script>

<template>
  <div ref="root" class="hlx-chart-panel" role="dialog" aria-label="編輯圖表" @keydown="onKeydown" @focusout="onFocusOut">
    <div class="hlx-chart-panel-head">
      <IconChart />
      <span class="hlx-chart-panel-title">編輯圖表</span>
    </div>
    <div class="hlx-chart-tabs" role="tablist" aria-label="圖表設定">
      <button
        v-for="item in TABS"
        :key="item.id"
        type="button"
        role="tab"
        :aria-selected="tab === item.id"
        :disabled="!draft"
        @click="tab = item.id"
      >
        {{ item.label }}
      </button>
    </div>
    <div class="hlx-chart-panel-body">
      <p v-if="!draft" class="hlx-chart-form-off">
        規格不是 JSON 物件，表單無法使用；請先在「原始資料」修好。
      </p>
      <div v-else class="hlx-chart-tab-panel" role="tabpanel">
        <ChartSetupTab v-if="tab === 'setup'" :draft="draft" @change="write" />
        <ChartDataTab v-else-if="tab === 'data'" :draft="draft" @change="write" />
        <ChartStyleTab v-else :draft="draft" @change="write" />
      </div>
    </div>
  </div>
</template>
