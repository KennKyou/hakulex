<script setup lang="ts">
import type { NestedContent } from '../nested/content'
import { NestedDocView } from '@hakulex/renderer'
import { $getRoot } from 'lexical'
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { latestState } from '../nested/content'
import { focusNested, NestedEditorArea } from '../nested/keys'
import { nestedFocusChannel, useNestedBlock } from '../plugins/NestedBlockPlugin'

const props = defineProps<{
  nodeKey: string
  content: NestedContent
}>()

const { outer, editable, selected, leave, selectBlock, onPointerDown, onClick } = useNestedBlock(props.nodeKey)

// A long one starts cut short, as in the renderer, while editing too. The caret going in (a
// click, the arrows, an undo) opens it; it stays open until its button closes it.
const PREVIEW_BLOCKS = 6
const collapsible = computed(() => latestState(props.content.editor).read(() => $getRoot().getChildrenSize()) > PREVIEW_BLOCKS)
const expanded = shallowRef(false)
function onFocusIn(event: FocusEvent) {
  if (editable.value && (event.target as Element).closest('[data-lexical-editor]') === props.content.editor.getRootElement())
    expanded.value = true
}

let unregister: (() => void) | undefined
onMounted(() => {
  // Also applies a request made before mount (a freshly inserted block).
  unregister = nestedFocusChannel.register(outer, props.nodeKey, target => focusNested(props.content.editor, target === 'first'
    ? 'start'
    : 'end'))
})
onBeforeUnmount(() => unregister?.())
</script>

<template>
  <div
    class="hlx-nested-doc-editor"
    :data-selected="selected || undefined"
    @pointerdown.capture="onPointerDown"
    @click="onClick"
    @focusin="onFocusIn"
  >
    <NestedDocView v-model:expanded="expanded" :collapsible="collapsible">
      <NestedEditorArea
        :content="content"
        :on-exit="leave"
        :on-escape="selectBlock"
      />
    </NestedDocView>
  </div>
</template>
