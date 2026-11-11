<script setup lang="ts">
import type { BlockFields } from '../plugins/ContentBlockPlugin'
import { LinkCardView, normalizeLinkCard } from '@hakulex/renderer'
import { useLexicalComposer } from '@hakulex/vue-lexical'
import { $createLinkNode } from '@lexical/link'
import { $createParagraphNode, $createTextNode, $getNodeByKey, HISTORY_PUSH_TAG } from 'lexical'
import { computed, h, useTemplateRef } from 'vue'
import { useBlockPanel } from '../media/live-edit'
import { $isLinkCardNode } from '../nodes/LinkCardNode'
import { useContentBlock } from '../plugins/ContentBlockPlugin'
import BlockPanel from './BlockPanel.vue'
import BlockToolbar from './BlockToolbar.vue'
import LinkCardPanel from './LinkCardPanel.vue'

const props = defineProps<{
  nodeKey: string
  fields: Record<string, unknown>
}>()

// An arrow out of a box: the link opens elsewhere.
function IconLink() {
  return h('svg', {
    'viewBox': '0 0 16 16',
    'width': 14,
    'height': 14,
    'fill': 'none',
    'stroke': 'currentColor',
    'stroke-width': 1.4,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  }, [
    h('path', { d: 'M9 3h4v4M13 3 7.5 8.5M11 9.5V13H3V5h3.5' }),
  ])
}

// Two links in a chain: the card goes back to being a link.
function IconToLink() {
  return h('svg', {
    'viewBox': '0 0 24 24',
    'width': 14,
    'height': 14,
    'fill': 'none',
    'stroke': 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  }, [
    h('path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }),
    h('path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }),
  ])
}

const card = computed(() => normalizeLinkCard(props.fields))
const editor = useLexicalComposer()
const { editable, selected, onClick, onKeydown } = useContentBlock(props.nodeKey, 'link-card')
const block = useTemplateRef<HTMLElement>('block')

/* Edited in a panel beside it: each change goes in as it is made. */

function $readCard(node: unknown) {
  return $isLinkCardNode(node as never)
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
  $read: node => $readCard(node),
  // The card becomes exactly this: a field it doesn't have goes.
  $write: (node, fields) => {
    if (!$isLinkCardNode(node))
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
  const fields = editor.getEditorState().read(() => $readCard($getNodeByKey(props.nodeKey)))
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
// A card's link, which a click in the editor only picks. Only a safe http(s) link has one.
const openAction = computed(() => card.value?.href
  ? [
      {
        id: 'open',
        label: '開啟連結',
        icon: IconLink,
        onSelect: () => window.open(card.value!.href, '_blank', 'noopener,noreferrer'),
      },
      {
        id: 'to-link',
        label: '轉成連結',
        icon: IconToLink,
        onSelect: toLink,
      },
    ]
  : [])

/** A line holding only the card's link, reading its title or its address. */
function toLink() {
  editor.update(() => {
    const node = $getNodeByKey(props.nodeKey)
    if (!$isLinkCardNode(node) || !card.value?.href)
      return
    const url = card.value.href
    const line = $createParagraphNode().append($createLinkNode(url).append($createTextNode(card.value.untitled
      ? url
      : card.value.title)))
    node.replace(line)
    line.selectEnd()
  }, { tag: HISTORY_PUSH_TAG })
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
    <template v-if="card">
      <LinkCardView v-bind="card" :static="editable" />
    </template>
    <div v-else class="hlx-block-empty">
      <span>空的連結卡片</span>
      <button v-if="editable" type="button" class="hlx-block-edit" @click.stop="openPanel">
        編輯
      </button>
    </div>
  </div>
  <BlockToolbar v-if="showToolbar" ref="blockToolbar" label="連結卡片" :actions="[editAction, ...openAction]" :style="toolbarStyle" />
  <BlockPanel
    v-if="open"
    ref="blockPanel"
    title="連結卡片"
    :icon="IconLink"
    :style="panelStyle"
    @close="close('keep')"
    @revert="close('revert')"
  >
    <LinkCardPanel :fields="fields" @write="onWrite" @end-typing="endTyping" />
  </BlockPanel>
</template>
