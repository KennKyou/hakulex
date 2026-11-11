<script setup lang="ts">
import { embedLabel, parseHttpUrl } from '@hakulex/renderer'
import { useLexicalComposer, useLexicalEditable, useLexicalNodeSelection } from '@hakulex/vue-lexical'
import { $addUpdateTag, $createParagraphNode, $getNodeByKey, $getRoot, $isElementNode, HISTORY_PUSH_TAG, SKIP_DOM_SELECTION_TAG } from 'lexical'
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { $selectNode } from '../media/block-navigation'
import { $isEmbedNode, embedFocusChannel } from '../nodes/EmbedNode'

const props = defineProps<{
  nodeKey: string
  url: string
}>()

const editor = useLexicalComposer()
const editable = useLexicalEditable()
const { isSelected, setSelected, clearSelection } = useLexicalNodeSelection(props.nodeKey)
const selected = computed(() => editable.value && isSelected.value)
const input = useTemplateRef<HTMLInputElement>('input')

const draft = shallowRef(props.url)
const invalid = shallowRef(false)
const link = computed(() => (parseHttpUrl(props.url)
  ? props.url
  : null))
// What the document has or is about to have: Enter then blur shouldn't save twice.
let saved = props.url

watch(() => props.url, (url) => {
  draft.value = url
  saved = url
  invalid.value = false
})
watch(draft, () => {
  invalid.value = false
})

let unregister: (() => void) | undefined
onMounted(() => {
  // Also applies a request made before mount (a freshly inserted embed).
  unregister = embedFocusChannel.register(editor, props.nodeKey, () => input.value?.focus())
})
onBeforeUnmount(() => unregister?.())

/** Writes the draft. False when it can't be written, which also says why. */
function save(leaving: boolean): boolean {
  const next = draft.value.trim()
  if (next && !parseHttpUrl(next)) {
    invalid.value = true
    return false
  }
  if (next === saved)
    return true
  saved = next
  editor.update(() => {
    const node = $getNodeByKey(props.nodeKey)
    if (!$isEmbedNode(node))
      return
    $addUpdateTag(HISTORY_PUSH_TAG)
    // On the way to wherever was just clicked: don't pull the caret back.
    if (leaving)
      $addUpdateTag(SKIP_DOM_SELECTION_TAG)
    node.setUrl(next)
  })
  return true
}

function focusEditor() {
  editor.getRootElement()?.focus({ preventScroll: true })
}

function onKeydown(event: KeyboardEvent) {
  // The Enter and Esc that deal with a word being composed aren't ours.
  if (event.isComposing)
    return
  if (event.key === 'Enter') {
    event.preventDefault()
    if (!save(false))
      return
    focusEditor()
    editor.update(() => {
      const node = $getNodeByKey(props.nodeKey)
      if (!node)
        return
      let next = node.getNextSibling()
      if (!$isElementNode(next)) {
        next = $createParagraphNode()
        node.insertAfter(next)
      }
      next.selectStart()
    })
  }
  else if (event.key === 'Escape') {
    event.preventDefault()
    draft.value = saved
    focusEditor()
    editor.update(() => {
      const node = $getNodeByKey(props.nodeKey)
      if (node)
        $selectNode(node)
    })
  }
}

function onClick() {
  if (!editable.value)
    return
  clearSelection()
  setSelected(true)
}

function remove() {
  focusEditor()
  editor.update(() => {
    const node = $getNodeByKey(props.nodeKey)
    if (!node)
      return
    $addUpdateTag(HISTORY_PUSH_TAG)
    const next = node.getNextSibling()
    const previous = node.getPreviousSibling()
    if ($isElementNode(next)) {
      next.selectStart()
    }
    else if ($isElementNode(previous)) {
      previous.selectEnd()
    }
    else if (!next && !previous) {
      const paragraph = $createParagraphNode()
      $getRoot().append(paragraph)
      paragraph.select()
    }
    node.remove()
  })
}

function openLink() {
  if (link.value)
    window.open(link.value, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <div
    class="hlx-embed-editor"
    :data-selected="selected || undefined"
    @click="onClick"
  >
    <div class="hlx-embed-row">
      <span class="hlx-embed-label">{{ embedLabel(url) }}</span>
      <!-- The events stop here: what happens in this input is none of Lexical's business. -->
      <input
        ref="input"
        v-model="draft"
        class="hlx-embed-input"
        type="url"
        placeholder="貼上網址"
        aria-label="嵌入的網址"
        autocomplete="off"
        spellcheck="false"
        :readonly="!editable"
        :aria-invalid="invalid || undefined"
        @click.stop
        @keydown.stop="onKeydown"
        @keyup.stop
        @keypress.stop
        @beforeinput.stop
        @input.stop
        @paste.stop
        @copy.stop
        @cut.stop
        @compositionstart.stop
        @compositionupdate.stop
        @compositionend.stop
        @blur="editable && save(true)"
      >
      <button v-if="link" type="button" class="hlx-embed-button" data-action="open" @click.stop="openLink">
        開啟
      </button>
      <button v-if="editable" type="button" class="hlx-embed-button" data-action="remove" @click.stop="remove">
        刪除
      </button>
    </div>
    <p v-if="invalid" class="hlx-embed-error" role="alert">
      只能使用 http 或 https 網址
    </p>
  </div>
</template>
