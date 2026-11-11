<script setup lang="ts">
import type { ChartPanelState } from '../plugins/ContentBlockPlugin'
import type { BlockToolbarAction } from './BlockToolbar.vue'
import { ChartView, parseChartSource } from '@hakulex/renderer'
import { useLexicalComposer } from '@hakulex/vue-lexical'
import { $getNodeByKey } from 'lexical'
import { computed, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'
import { IconChart, IconCode, IconSliders, IconTable } from '../chart/icons'
import { $selectNode } from '../media/block-navigation'
import { useBlockFloating, useOutsidePress } from '../media/floating'
import { chartPanelOf, useContentBlock } from '../plugins/ContentBlockPlugin'
import { useEditorTheme } from '../theme-context'
import BlockToolbar from './BlockToolbar.vue'
import ChartPanel from './ChartPanel.vue'
import ChartRawPanel from './ChartRawPanel.vue'

const props = defineProps<{
  nodeKey: string
  fields: Record<string, unknown>
}>()

const editor = useLexicalComposer()
const theme = useEditorTheme()
const { editable, selected, onClick, onKeydown } = useContentBlock(props.nodeKey, 'chart')

const panels = chartPanelOf(editor)
const panel = computed(() => panels.value?.key === props.nodeKey
  ? panels.value.kind
  : null)
const valid = computed(() => parseChartSource(props.fields.spec).ok)
const view = shallowRef<'chart' | 'table'>('chart')
watch(valid, (ok) => {
  if (!ok)
    view.value = 'chart'
})
const showToolbar = computed(() => editable.value && (selected.value || panel.value !== null))

function toggle(kind: ChartPanelState['kind']) {
  panels.value = panel.value === kind
    ? null
    : { key: props.nodeKey, kind }
}

/** Puts the panel away, and leaves the chart picked, with the keyboard back in the editor. */
function close(focus = true) {
  if (panel.value)
    panels.value = null
  editor.update(() => {
    const node = $getNodeByKey(props.nodeKey)
    if (node)
      $selectNode(node)
  })
  if (focus)
    editor.getRootElement()?.focus({ preventScroll: true })
}

/* The toolbar and the panels sit over the page, by the chart, and follow it as it moves. */

const block = useTemplateRef<HTMLElement>('block')
const toolbar = useTemplateRef<{ element: HTMLElement | null }>('toolbar')
const popover = useTemplateRef<HTMLElement>('popover')
const { toolbarStyle, panelStyle } = useBlockFloating(editor, block, showToolbar)
const popoverStyle = panelStyle(400)

// A press anywhere but the panel, the toolbar or the chart puts the panel away.
useOutsidePress(() => [block.value, toolbar.value?.element, popover.value], computed(() => panel.value !== null), () => close(false))
onBeforeUnmount(() => {
  if (panel.value)
    panels.value = null
})

const actions = computed<BlockToolbarAction[]>(() => [
  {
    id: 'edit',
    label: '編輯圖表',
    icon: IconSliders,
    expanded: panel.value === 'form',
    onSelect: () => toggle('form'),
  },
  ...(valid.value
    ? [
        {
          id: 'data',
          label: view.value === 'table'
            ? '檢視圖表'
            : '檢視資料',
          icon: view.value === 'table'
            ? IconChart
            : IconTable,
          pressed: view.value === 'table',
          onSelect: () => {
            view.value = view.value === 'table'
              ? 'chart'
              : 'table'
          },
        },
      ]
    : []),
  {
    id: 'raw',
    label: '原始資料',
    icon: IconCode,
    expanded: panel.value === 'raw',
    onSelect: () => toggle('raw'),
  },
])
</script>

<template>
  <div
    ref="block"
    class="hlx-block-editor"
    :data-selected="selected || undefined"
    @click="onClick"
    @keydown="onKeydown"
  >
    <ChartView v-model:view="view" :spec="fields.spec" :toggle="!editable" />
  </div>
  <BlockToolbar v-if="showToolbar" ref="toolbar" class="hlx-chart-toolbar" label="圖表" :actions="actions" :style="toolbarStyle" />
  <Teleport v-if="showToolbar && panel" to="body">
    <div
      ref="popover"
      class="hlx-root hlx-chart-popover"
      :data-variant="theme.variant"
      :data-color-scheme="theme.colorScheme"
      :style="[theme.style, popoverStyle]"
    >
      <ChartPanel v-if="panel === 'form'" :node-key="nodeKey" :spec="fields.spec" @close="close()" />
      <ChartRawPanel v-else :node-key="nodeKey" :spec="fields.spec" @close="close()" />
    </div>
  </Teleport>
</template>
