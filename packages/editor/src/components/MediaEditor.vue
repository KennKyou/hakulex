<script setup lang="ts">
import type { FileData, VideoData } from '../media/types'
import type { MediaKind } from '../nodes/MediaNodes'
import { FileView, VideoView } from '@hakulex/renderer'
import { useLexicalComposer, useLexicalEditable, useLexicalNodeSelection } from '@hakulex/vue-lexical'
import { $getNodeByKey } from 'lexical'
import { computed, h, inject, useTemplateRef } from 'vue'
import { EditorCoreKey } from '../editor-core-key'
import { useBlockPanel } from '../media/live-edit'
import { $isFileNode, $isVideoNode } from '../nodes/MediaNodes'
import BlockPanel from './BlockPanel.vue'
import BlockToolbar from './BlockToolbar.vue'
import MediaPanel from './MediaPanel.vue'

const props = defineProps<{
  nodeKey: string
  kind: MediaKind
  data: VideoData | FileData
}>()

const editor = useLexicalComposer()
const editable = useLexicalEditable()
const { isSelected, setSelected, clearSelection } = useLexicalNodeSelection(props.nodeKey)
const selected = computed(() => editable.value && isSelected.value)
const video = computed(() => props.data as VideoData)
const file = computed(() => props.data as FileData)
const inline = computed(() => props.kind === 'file' && file.value.display === 'inline')

function onClick(event: MouseEvent) {
  if (!editable.value)
    return
  // While editing, a click on a card picks it instead of downloading it. The player's
  // controls are left alone, so a video can still be played.
  if ((event.target as Element).closest('a'))
    event.preventDefault()
  clearSelection()
  setSelected(true)
}

const root = useTemplateRef<{ $el?: HTMLElement } | HTMLElement>('root')
const element = computed(() => {
  const value = root.value
  return value instanceof HTMLElement
    ? value
    : value?.$el ?? null
})

/* Edited in a panel beside it: each change goes in as it is made. */

type MediaData = VideoData | FileData
function $readMedia(node: unknown): MediaData | null {
  return $isVideoNode(node as never) || $isFileNode(node as never)
    ? (node as { getData: () => MediaData }).getData()
    : null
}
const core = inject(EditorCoreKey, null)
const upload = computed(() => props.kind === 'video'
  ? core?.uploadVideo()
  : core?.uploadFile())
const {
  open,
  showToolbar,
  toolbarStyle,
  panelStyle,
  editAction,
  close,
  openPanel,
  write,
  endTyping,
} = useBlockPanel<MediaData>(props.nodeKey, element, selected, editable, {
  $read: node => $readMedia(node),
  $write: (node, data) => {
    if ($isVideoNode(node))
      node.setData(data as VideoData)
    else if ($isFileNode(node))
      node.setData(data as FileData)
  },
}, {
  toolbar: useTemplateRef('blockToolbar'),
  panel: useTemplateRef('blockPanel'),
})
function onWrite(patch: Partial<VideoData & FileData>, field?: string) {
  const data = editor.getEditorState().read(() => $readMedia($getNodeByKey(props.nodeKey)))
  if (data) {
    write({
      ...data,
      ...patch,
    } as MediaData, field)
  }
}

// The file card is a link, which in the editor only picks: a double click on it edits too.
function onDblclick(event: MouseEvent) {
  if (!editable.value || (event.target as Element).closest('button'))
    return
  event.preventDefault()
  openPanel()
}

function IconMedia() {
  return h('svg', {
    'viewBox': '0 0 16 16',
    'fill': 'none',
    'stroke': 'currentColor',
    'stroke-width': 1.4,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  }, props.kind === 'video'
    ? [
        h('rect', {
          x: 2,
          y: 3.5,
          width: 12,
          height: 9,
          rx: 1.5,
        }),
        h('path', { d: 'M7 6.5v3l2.5-1.5z' }),
      ]
    : [
        h('path', { d: 'M9 2.5H4.5v11h7V5z' }),
        h('path', { d: 'M9 2.5V5h2.5' }),
      ])
}

function pick() {
  clearSelection()
  setSelected(true)
}
</script>

<template>
  <component
    :is="inline ? 'span' : 'div'"
    ref="root"
    class="hlx-media-editor"
    :class="{ 'hlx-media-editor--inline': inline }"
    :data-selected="selected || undefined"
    @click="onClick"
    @dblclick="onDblclick"
  >
    <VideoView
      v-if="kind === 'video'"
      :src="video.src"
      :poster="video.poster"
      :width="video.width"
      :height="video.height"
    />
    <FileView
      v-else
      :src="file.src"
      :name="file.name"
      :size="file.size"
      :mime-type="file.mimeType"
      :ext="file.ext"
      :display="file.display"
    />
    <!--
      Firefox's player keeps every mouse event to itself, so a video can't be picked by clicking
      it: this picks it, and its toolbar does the rest.
    -->
    <button
      v-if="editable && kind === 'video' && !selected && !open"
      type="button"
      class="hlx-media-pick"
      data-on-hover=""
      @click.stop="pick"
    >
      選取
    </button>
  </component>
  <BlockToolbar v-if="showToolbar" ref="blockToolbar" :label="kind === 'video' ? '影片' : '檔案'" :actions="[editAction]" :style="toolbarStyle" />
  <BlockPanel
    v-if="open"
    ref="blockPanel"
    :title="kind === 'video' ? '影片' : '檔案'"
    :icon="IconMedia"
    :style="panelStyle"
    @close="close('keep')"
    @revert="close('revert')"
  >
    <MediaPanel :kind="kind" :data="data" :upload="upload" @write="onWrite" @end-typing="endTyping" />
  </BlockPanel>
</template>
