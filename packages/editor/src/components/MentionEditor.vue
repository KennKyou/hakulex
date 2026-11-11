<script setup lang="ts">
import type { MentionData } from '../nodes/MentionNode'
import { MENTION_PLATFORMS, mentionUrl, MentionView } from '@hakulex/renderer'
import { useLexicalComposer, useLexicalEditable } from '@hakulex/vue-lexical'
import { $addUpdateTag, $getNodeByKey, HISTORY_PUSH_TAG, SKIP_DOM_SELECTION_TAG } from 'lexical'
import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot } from 'reka-ui'
import { computed, nextTick, shallowRef, useTemplateRef } from 'vue'
import { $isMentionNode } from '../nodes/MentionNode'
import { useEditorTheme } from '../theme-context'

const props = defineProps<{
  nodeKey: string
  data: MentionData
}>()

const editor = useLexicalComposer()
const editable = useLexicalEditable()
const theme = useEditorTheme()
const handleInput = useTemplateRef<HTMLInputElement>('handleInput')

const open = shallowRef(false)
const platform = shallowRef('')
const handle = shallowRef('')
const displayName = shallowRef('')

const cleanHandle = () => handle.value.trim().replace(/^@+/, '')

const platforms = computed(() => {
  const known = Object.entries(MENTION_PLATFORMS).map(([value, { label }]) => ({ value, label }))
  return known.some(({ value }) => value === platform.value)
    ? known
    : [
        ...known,
        { value: platform.value, label: platform.value },
      ]
})

const link = computed(() => mentionUrl({
  platform: platform.value,
  handle: cleanHandle() || props.data.handle,
}))

function onClick(event: MouseEvent) {
  if (!editable.value)
    return
  // While editing, a click is for changing the mention. The panel has the way out to the link.
  event.preventDefault()
  platform.value = props.data.platform
  handle.value = props.data.handle
  displayName.value = props.data.displayName ?? ''
  open.value = true
  void nextTick(() => handleInput.value?.select())
}

function save(leaving: boolean) {
  // Giving focus back counts as leaving too, once the panel is already on its way out.
  if (!open.value)
    return
  open.value = false
  if (!leaving)
    editor.getRootElement()?.focus({ preventScroll: true })
  const next: MentionData = {
    platform: platform.value,
    handle: cleanHandle() || props.data.handle,
    ...(displayName.value.trim()
      ? {
          displayName: displayName.value.trim(),
        }
      : {}),
  }
  const { data } = props
  const changed = next.platform !== data.platform || next.handle !== data.handle || next.displayName !== data.displayName
  if (leaving && !changed)
    return
  editor.update(() => {
    const node = $getNodeByKey(props.nodeKey)
    if (!$isMentionNode(node))
      return
    // On the way to wherever was just clicked: don't pull the caret back.
    if (leaving)
      $addUpdateTag(SKIP_DOM_SELECTION_TAG)
    else
      node.selectNext(0, 0)
    if (changed) {
      $addUpdateTag(HISTORY_PUSH_TAG)
      node.setData(next)
    }
  })
}

function cancel(event: KeyboardEvent) {
  event.preventDefault()
  // The Esc that closes the word list isn't ours.
  if (event.isComposing)
    return
  open.value = false
  editor.getRootElement()?.focus({ preventScroll: true })
  editor.update(() => $getNodeByKey(props.nodeKey)?.selectNext(0, 0))
}

function onKeydown(event: KeyboardEvent) {
  // The Enter that picks a word isn't ours, and on a button it presses the button.
  if (event.key !== 'Enter' || event.isComposing || (event.target as Element).closest('button'))
    return
  event.preventDefault()
  save(false)
}

function remove() {
  open.value = false
  editor.getRootElement()?.focus({ preventScroll: true })
  editor.update(() => {
    const node = $getNodeByKey(props.nodeKey)
    if (!$isMentionNode(node))
      return
    $addUpdateTag(HISTORY_PUSH_TAG)
    node.selectPrevious()
    node.remove()
  })
}

function openLink() {
  if (link.value)
    window.open(link.value, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <PopoverRoot :open="open">
    <PopoverAnchor as-child>
      <span
        class="hlx-mention-editor"
        :data-open="open || undefined"
        @click="onClick"
      >
        <MentionView
          :platform="data.platform"
          :handle="data.handle"
          :display-name="data.displayName"
        />
      </span>
    </PopoverAnchor>
    <PopoverPortal>
      <PopoverContent
        class="hlx-root hlx-mention-panel"
        :data-variant="theme.variant"
        :data-color-scheme="theme.colorScheme"
        :style="theme.style"
        side="bottom"
        align="start"
        :side-offset="6"
        :collision-padding="8"
        @open-auto-focus.prevent
        @close-auto-focus.prevent
        @escape-key-down="cancel"
        @interact-outside="save(true)"
        @keydown="onKeydown"
      >
        <label class="hlx-mention-field">
          <span>平台</span>
          <select v-model="platform" data-field="platform">
            <option v-for="item in platforms" :key="item.value" :value="item.value">
              {{ item.label }}
            </option>
          </select>
        </label>
        <label class="hlx-mention-field">
          <span>帳號</span>
          <input ref="handleInput" v-model="handle" data-field="handle" autocomplete="off" spellcheck="false">
        </label>
        <label class="hlx-mention-field">
          <span>顯示名稱</span>
          <input v-model="displayName" data-field="displayName" autocomplete="off" placeholder="使用帳號">
        </label>
        <div class="hlx-mention-actions">
          <button v-if="link" type="button" data-action="open" @click="openLink">
            開啟連結
          </button>
          <button type="button" data-action="remove" @click="remove">
            移除
          </button>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
