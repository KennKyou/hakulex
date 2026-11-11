<script setup lang="ts">
import type { BlockFields } from '../plugins/ContentBlockPlugin'
import { normalizePoll, PollView } from '@hakulex/renderer'
import { useLexicalComposer } from '@hakulex/vue-lexical'
import { $getNodeByKey } from 'lexical'
import { computed, h, useTemplateRef } from 'vue'
import { useBlockPanel } from '../media/live-edit'
import { $isPollNode } from '../nodes/PollNode'
import { isFreshBlock, useContentBlock } from '../plugins/ContentBlockPlugin'
import BlockPanel from './BlockPanel.vue'
import BlockToolbar from './BlockToolbar.vue'
import PollPanel from './PollPanel.vue'

const props = defineProps<{
  nodeKey: string
  fields: Record<string, unknown>
}>()

// No backend here: the editor shows what readers will be asked, not results.
const poll = computed(() => normalizePoll(props.fields))
const editor = useLexicalComposer()
const { editable, selected, onClick, onKeydown } = useContentBlock(props.nodeKey, 'poll')
const block = useTemplateRef<HTMLElement>('block')

/* Edited in a panel beside it: each change goes in as it is made. */

function $readPoll(node: unknown) {
  return $isPollNode(node as never)
    ? {
        ...(node as { getFields: () => BlockFields }).getFields(),
      }
    : null
}
const {
  open,
  showToolbar,
  toolbarStyle,
  panelStyle,
  editAction,
  close,
  openPanel,
  onDblclick,
  write,
  endTyping,
} = useBlockPanel<BlockFields>(props.nodeKey, block, selected, editable, {
  $read: node => $readPoll(node),
  // The poll becomes exactly this: a field it doesn't have goes.
  $write: (node, fields) => {
    if (!$isPollNode(node))
      return
    const gone = Object.fromEntries(Object.keys(node.getFields()).map(name => [name, undefined]))
    node.setFields({
      ...gone,
      ...fields,
    })
  },
}, {
  toolbar: useTemplateRef('blockToolbar'),
  panel: useTemplateRef('blockPanel'),
})
function onWrite(patch: BlockFields, field?: string) {
  const fields = editor.getEditorState().read(() => $readPoll($getNodeByKey(props.nodeKey)))
  if (!fields)
    return
  const next = {
    ...fields,
    ...patch,
  }
  for (const [name, value] of Object.entries(patch)) {
    if (value === undefined)
      delete next[name]
  }
  write(next, field)
}

// A ballot box: a slot over a bar chart.
function IconPoll() {
  return h('svg', {
    'viewBox': '0 0 16 16',
    'fill': 'none',
    'stroke': 'currentColor',
    'stroke-width': 1.4,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  }, [
    h('path', { d: 'M3 13V9M8 13V3M13 13V6' }),
  ])
}
</script>

<template>
  <div
    ref="block"
    class="hlx-block-editor"
    :data-selected="selected || undefined"
    @click="onClick"
    @dblclick="onDblclick"
    @keydown="onKeydown"
  >
    <template v-if="poll">
      <PollView v-bind="poll" />
    </template>
    <div v-else class="hlx-block-empty">
      <span>空的投票</span>
      <button v-if="editable" type="button" class="hlx-block-edit" @click.stop="openPanel">
        編輯
      </button>
    </div>
  </div>
  <BlockToolbar v-if="showToolbar" ref="blockToolbar" label="投票" :actions="[editAction]" :style="toolbarStyle" />
  <BlockPanel
    v-if="open"
    ref="blockPanel"
    title="投票"
    :icon="IconPoll"
    :style="panelStyle"
    @close="close('keep')"
    @revert="close('revert')"
  >
    <PollPanel :fields="fields" :fresh="isFreshBlock(editor, nodeKey)" @write="onWrite" @end-typing="endTyping" />
  </BlockPanel>
</template>
