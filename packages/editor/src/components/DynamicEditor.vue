<script setup lang="ts">
import type { BlockFields } from '../plugins/ContentBlockPlugin'
import { DynamicSettingsKey, DynamicView, normalizeDynamic } from '@hakulex/renderer'
import { useLexicalComposer, useLexicalEditable, useLexicalNodeSelection } from '@hakulex/vue-lexical'
import { $getNodeByKey } from 'lexical'
import { computed, h, inject, onBeforeUnmount, onMounted, provide, useTemplateRef } from 'vue'
import { EditorCoreKey } from '../editor-core-key'
import { useBlockPanel } from '../media/live-edit'
import { $isDynamicNode } from '../nodes/DynamicNode'
import { useEditorTheme } from '../theme-context'
import BlockPanel from './BlockPanel.vue'
import BlockToolbar from './BlockToolbar.vue'
import DynamicPanel from './DynamicPanel.vue'

const props = defineProps<{
  nodeKey: string
  fields: Record<string, unknown>
}>()

const editor = useLexicalComposer()
const editable = useLexicalEditable()
const theme = useEditorTheme()
const core = inject(EditorCoreKey, null)
const { isSelected, setSelected, clearSelection } = useLexicalNodeSelection(props.nodeKey)
const selected = computed(() => editable.value && isSelected.value)
const shown = computed(() => normalizeDynamic(props.fields))

// The component runs here as it does for readers, under the site's rule for addresses.
provide(DynamicSettingsKey, () => ({
  allow: core?.allowDynamicUrl(),
  theme: theme.value.colorScheme,
}))

/* Edited in a panel beside it: each change goes in as it is made. */

const block = useTemplateRef<HTMLElement>('block')
function $readFields(node: unknown) {
  return $isDynamicNode(node as never)
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
  write,
  endTyping,
} = useBlockPanel<BlockFields>(props.nodeKey, block, selected, editable, {
  $read: node => $readFields(node),
  // The block becomes exactly this: a field it doesn't have goes.
  $write: (node, fields) => {
    if (!$isDynamicNode(node))
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
  const fields = editor.getEditorState().read(() => $readFields($getNodeByKey(props.nodeKey)))
  if (fields) {
    write({
      ...fields,
      ...patch,
    }, field)
  }
}

/** Picks the block, with the keyboard in the editor: the button that did it goes away. */
function pick() {
  if (!editable.value)
    return
  clearSelection()
  setSelected(true)
  editor.getRootElement()?.focus({ preventScroll: true })
}

/*
 * What happens inside the component is the component's. Its events cross the shadow root and
 * would reach Lexical as typing, deleting or picking, so they stop at this block.
 */
// The path, not the target: outside the shadow root the target is the host, inside it a field.
const insideComponent = (event: Event) => event.composedPath().some(node => node instanceof Element && node.classList.contains('hlx-dynamic-host'))
const KEPT = [
  'keydown',
  'keyup',
  'keypress',
  'beforeinput',
  'input',
  'paste',
  'copy',
  'cut',
  'drop',
  'dragover',
  'compositionstart',
  'compositionupdate',
  'compositionend',
  'mousedown',
  'mouseup',
  'pointerdown',
  'pointerup',
  'click',
  'dblclick',
] as const
function keep(event: Event) {
  if (insideComponent(event))
    event.stopPropagation()
}
onMounted(() => KEPT.forEach(name => block.value?.addEventListener(name, keep)))
onBeforeUnmount(() => KEPT.forEach(name => block.value?.removeEventListener(name, keep)))

// Around the component, a press picks the block and a double click opens its panel.
function onClick(event: MouseEvent) {
  if (insideComponent(event) || (event.target as Element).closest('button'))
    return
  pick()
}
function onDblclick(event: MouseEvent) {
  if (!editable.value || insideComponent(event) || (event.target as Element).closest('button'))
    return
  event.preventDefault()
  openPanel()
}

// Boxes: a component of the site's own.
function IconDynamic() {
  return h('svg', {
    'viewBox': '0 0 16 16',
    'fill': 'none',
    'stroke': 'currentColor',
    'stroke-width': 1.4,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  }, [
    h('path', { d: 'M8 2.5l5 2.75v5.5L8 13.5l-5-2.75v-5.5z' }),
    h('path', { d: 'M3 5.25l5 2.75 5-2.75M8 8v5.5' }),
  ])
}
</script>

<template>
  <div
    ref="block"
    class="hlx-block-editor hlx-dynamic-editor"
    :data-selected="selected || undefined"
    @click="onClick"
    @dblclick="onDblclick"
  >
    <DynamicView :url="shown.url" :component-props="shown.props" :initial-height="shown.initialHeight" />
    <!-- A running component keeps its clicks, so the block is picked by this. -->
    <button
      v-if="editable && !selected && !open"
      type="button"
      class="hlx-media-pick hlx-dynamic-pick"
      data-on-hover=""
      @click.stop="pick"
    >
      選取
    </button>
  </div>
  <BlockToolbar v-if="showToolbar" ref="blockToolbar" label="動態元件" :actions="[editAction]" :style="toolbarStyle" />
  <BlockPanel
    v-if="open"
    ref="blockPanel"
    title="動態元件"
    :icon="IconDynamic"
    :style="panelStyle"
    @close="close('keep')"
    @revert="close('revert')"
  >
    <DynamicPanel :fields="fields" @write="onWrite" @end-typing="endTyping" />
  </BlockPanel>
</template>
