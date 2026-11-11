<script setup lang="ts">
import type { VirtualElement } from '@floating-ui/vue'
import type { MentionMenuItem, MentionTrigger } from './trigger'
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/vue'
import { $createMentionNode, useEditorTheme } from '@hakulex/editor'
import { MENTION_PLATFORMS } from '@hakulex/renderer'
import { useLexicalComposer, useLexicalRegister } from '@hakulex/vue-lexical'
import { mergeRegister } from '@lexical/utils'
import {
  $addUpdateTag,
  $createTextNode,
  $getNodeByKey,
  $isTextNode,
  BLUR_COMMAND,
  COMMAND_PRIORITY_NORMAL,
  HISTORY_PUSH_TAG,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
} from 'lexical'
import { computed, nextTick, onBeforeUnmount, shallowRef, useId, useTemplateRef, watch } from 'vue'
import { $getMentionTrigger, $splitTrigger, isWaitingForHandle, mentionMenuItems } from './trigger'

const editor = useLexicalComposer()
const menu = useTemplateRef<HTMLDivElement>('menu')
const listboxId = `hlx-mention-${useId()}`
const optionId = (item: MentionMenuItem) => `${listboxId}-${item.key}`

const trigger = shallowRef<MentionTrigger | null>(null)
const activeIndex = shallowRef(0)
// Start of a trigger the user closed with Esc; it stays closed until that `@` goes away.
let dismissedAt: string | null = null
const triggerStart = (match: MentionTrigger) => `${match.nodeKey}:${match.end - match.length}`

const items = computed(() => (trigger.value
  ? mentionMenuItems(trigger.value.query)
  : []))
const waiting = computed(() => !!trigger.value && isWaitingForHandle(trigger.value.query))
const open = computed(() => items.value.length > 0 || waiting.value)
const activeItem = computed(() => items.value[activeIndex.value])

watch(() => trigger.value?.query, () => {
  activeIndex.value = 0
})

/* Tracking the trigger */

function $sync() {
  // Hidden while composing, without forgetting Esc: the word isn't known until it's picked.
  if (editor.isComposing()) {
    trigger.value = null
    return
  }
  const root = editor.getRootElement()
  const focused = !!root && root.contains(root.ownerDocument.activeElement)
  const next = focused && editor.isEditable()
    ? $getMentionTrigger()
    : null
  if (!next) {
    dismissedAt = null
    trigger.value = null
    return
  }
  // A different `@` than the one closed means the closed one went away.
  if (dismissedAt && triggerStart(next) !== dismissedAt)
    dismissedAt = null
  trigger.value = dismissedAt ? null : next
}

function close() {
  if (trigger.value)
    dismissedAt = triggerStart(trigger.value)
  trigger.value = null
}

function select(item: MentionMenuItem | undefined) {
  const current = trigger.value
  if (!item || !current)
    return
  trigger.value = null
  editor.update(() => {
    const node = $getNodeByKey(current.nodeKey)
    if (!$isTextNode(node))
      return
    if (!item.handle) {
      node.spliceText(current.end - current.length, current.length, `@${item.platform}:`, true)
      return
    }
    $addUpdateTag(HISTORY_PUSH_TAG)
    const mention = $createMentionNode(item.platform, item.handle)
    const space = $createTextNode(' ')
    $splitTrigger(node, current).replace(mention)
    mention.insertAfter(space)
    space.select(1, 1)
  })
}

function move(delta: number) {
  const count = items.value.length
  activeIndex.value = (activeIndex.value + delta + count) % count
}

/** Claims a key only while there is something to pick, so Enter still works otherwise. */
function whenPicking(handler: () => void) {
  return (event: KeyboardEvent | null) => {
    if (!items.value.length || event?.isComposing)
      return false
    event?.preventDefault()
    event?.stopImmediatePropagation()
    handler()
    return true
  }
}

useLexicalRegister(editor => mergeRegister(
  editor.registerUpdateListener(({ editorState }) => editorState.read($sync)),
  editor.registerCommand(BLUR_COMMAND, () => {
    trigger.value = null
    return false
  }, COMMAND_PRIORITY_NORMAL),
  // Above @lexical/list's arrow handlers and rich text's Enter / Tab.
  editor.registerCommand(KEY_ARROW_DOWN_COMMAND, whenPicking(() => move(1)), COMMAND_PRIORITY_NORMAL),
  editor.registerCommand(KEY_ARROW_UP_COMMAND, whenPicking(() => move(-1)), COMMAND_PRIORITY_NORMAL),
  editor.registerCommand(KEY_ENTER_COMMAND, whenPicking(() => select(activeItem.value)), COMMAND_PRIORITY_NORMAL),
  editor.registerCommand(KEY_TAB_COMMAND, whenPicking(() => select(activeItem.value)), COMMAND_PRIORITY_NORMAL),
  editor.registerCommand(KEY_ESCAPE_COMMAND, (event) => {
    if (!open.value)
      return false
    event?.preventDefault()
    close()
    return true
  }, COMMAND_PRIORITY_NORMAL),
))

/* Accessibility: the contenteditable keeps focus, so it advertises the listbox. */
watch([open, activeItem], ([isOpen, item]) => {
  const root = editor.getRootElement()
  if (!root)
    return
  if (isOpen && item) {
    root.setAttribute('aria-controls', listboxId)
    root.setAttribute('aria-expanded', 'true')
    root.setAttribute('aria-autocomplete', 'list')
    root.setAttribute('aria-activedescendant', optionId(item))
  }
  else {
    for (const name of [
      'aria-controls',
      'aria-expanded',
      'aria-autocomplete',
      'aria-activedescendant',
    ])
      root.removeAttribute(name)
  }
}, { flush: 'post' })
onBeforeUnmount(() => {
  trigger.value = null
})

watch(activeIndex, async () => {
  await nextTick()
  menu.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
})

/* Positioning at the caret */

// The menu is teleported to <body>; copy the editor's theme so tokens resolve the same.
const theme = useEditorTheme()

function caretRect(): DOMRect {
  const root = editor.getRootElement()
  const selection = root?.ownerDocument.getSelection()
  if (!root || !selection || selection.rangeCount === 0)
    return new DOMRect()
  const range = selection.getRangeAt(0)
  const rect = range.getClientRects()[0] ?? range.getBoundingClientRect()
  if (rect.height)
    return rect
  // Collapsed ranges can measure as empty; fall back to the containing element.
  const node = range.startContainer
  const element = node instanceof Element
    ? node
    : node.parentElement
  return element?.getBoundingClientRect() ?? rect
}

const reference = shallowRef<VirtualElement | null>(null)
watch(() => trigger.value?.nodeKey && trigger.value.end, () => {
  reference.value = {
    getBoundingClientRect: caretRect,
    contextElement: editor.getRootElement() ?? undefined,
  }
})

const { floatingStyles } = useFloating(reference, menu, {
  open,
  strategy: 'fixed',
  placement: 'bottom-start',
  middleware: [
    offset(6),
    flip({ padding: 8 }),
    shift({ padding: 8 }),
  ],
  whileElementsMounted: autoUpdate,
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      :id="listboxId"
      ref="menu"
      class="hlx-root hlx-mention-menu"
      role="listbox"
      aria-label="提及"
      :data-variant="theme.variant"
      :data-color-scheme="theme.colorScheme"
      :style="[theme.style, floatingStyles]"
      @mousedown.prevent
    >
      <div v-if="waiting" class="hlx-mention-menu-hint">
        輸入帳號
      </div>
      <div
        v-for="(item, index) in items"
        :id="optionId(item)"
        :key="item.key"
        class="hlx-mention-item"
        role="option"
        :aria-selected="item === activeItem"
        @mousemove="activeIndex = index"
        @click="select(item)"
      >
        <svg
          class="hlx-mention-item-icon"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          aria-hidden="true"
          :fill="MENTION_PLATFORMS[item.platform].color ?? 'currentColor'"
        >
          <path :d="MENTION_PLATFORMS[item.platform].icon" />
        </svg>
        <span class="hlx-mention-item-title">{{ item.title }}</span>
        <span class="hlx-mention-item-description">{{ item.description }}</span>
      </div>
    </div>
  </Teleport>
</template>
