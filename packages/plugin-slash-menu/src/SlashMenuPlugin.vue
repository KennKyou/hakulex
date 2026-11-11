<script setup lang="ts">
import type { VirtualElement } from '@floating-ui/vue'
import type { TriggerMatch } from './trigger'
import type { SlashMenuItem } from './types'
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/vue'
import { useEditorTheme } from '@hakulex/editor'
import { useLexicalComposer, useLexicalRegister } from '@hakulex/vue-lexical'
import { mergeRegister } from '@lexical/utils'
import {
  $getNodeByKey,
  $isTextNode,
  BLUR_COMMAND,
  COMMAND_PRIORITY_NORMAL,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
} from 'lexical'
import { computed, nextTick, onBeforeUnmount, shallowRef, useId, useTemplateRef, watch } from 'vue'
import { builtinSlashItems } from './builtinItems'
import { filterItems } from './filter'
import { $getTriggerMatch, $removeTrigger } from './trigger'

const props = withDefaults(defineProps<{
  /** Menu entries. Extend with `[...builtinSlashItems, myItem]`. */
  items?: SlashMenuItem[]
}>(), {
  items: () => builtinSlashItems,
})

const emit = defineEmits<{
  select: [item: SlashMenuItem]
}>()

const editor = useLexicalComposer()
const menu = useTemplateRef<HTMLDivElement>('menu')
const listboxId = `hlx-slash-${useId()}`
const optionId = (item: SlashMenuItem) => `${listboxId}-${item.key}`

const match = shallowRef<TriggerMatch | null>(null)
const activeIndex = shallowRef(0)
// Start of a trigger the user closed with Esc; it stays closed until that `/` goes away.
let dismissedAt: string | null = null
const triggerStart = (m: TriggerMatch) => `${m.nodeKey}:${m.end - m.length}`

interface Section { label?: string, items: SlashMenuItem[] }

const sections = computed<Section[]>(() => {
  if (!match.value)
    return []
  const available = props.items.filter(item => !item.requires || editor.hasNodes(item.requires))
  const results = filterItems(available, match.value.query)
  // Ranked results read best as one list; group only the unfiltered menu.
  if (match.value.query) {
    return [
      { items: results },
    ]
  }
  const groups = new Map<string | undefined, SlashMenuItem[]>()
  for (const item of results) {
    groups.set(item.group, [
      ...(groups.get(item.group) ?? []),
      item,
    ])
  }
  return [...groups].map(([label, items]) => ({ label, items }))
})
const flatItems = computed(() => sections.value.flatMap(section => section.items))
const open = computed(() => flatItems.value.length > 0)
const activeItem = computed(() => flatItems.value[activeIndex.value])

watch(() => match.value?.query, () => {
  activeIndex.value = 0
})

/* Tracking the trigger */

function $sync() {
  const root = editor.getRootElement()
  const focused = !!root && root.contains(root.ownerDocument.activeElement)
  const next = focused && !editor.isComposing() && editor.isEditable()
    ? $getTriggerMatch()
    : null
  if (!next) {
    dismissedAt = null
    match.value = null
    return
  }
  match.value = triggerStart(next) === dismissedAt
    ? null
    : next
}

function close() {
  if (match.value)
    dismissedAt = triggerStart(match.value)
  match.value = null
}

function select(item: SlashMenuItem | undefined) {
  const current = match.value
  if (!item || !current)
    return
  editor.update(() => {
    const node = $getNodeByKey(current.nodeKey)
    if ($isTextNode(node))
      $removeTrigger(node, current)
    item.run(editor)
  })
  match.value = null
  emit('select', item)
}

function move(delta: number) {
  const count = flatItems.value.length
  activeIndex.value = (activeIndex.value + delta + count) % count
}

/** Wraps a key handler so it only claims the key while the menu is open. */
function whenOpen(handler: () => void) {
  return (event: KeyboardEvent | null) => {
    if (!open.value)
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
    match.value = null
    return false
  }, COMMAND_PRIORITY_NORMAL),
  // Above @lexical/list's arrow handlers and rich text's Enter / Tab.
  editor.registerCommand(KEY_ARROW_DOWN_COMMAND, whenOpen(() => move(1)), COMMAND_PRIORITY_NORMAL),
  editor.registerCommand(KEY_ARROW_UP_COMMAND, whenOpen(() => move(-1)), COMMAND_PRIORITY_NORMAL),
  editor.registerCommand(KEY_ENTER_COMMAND, whenOpen(() => select(activeItem.value)), COMMAND_PRIORITY_NORMAL),
  editor.registerCommand(KEY_TAB_COMMAND, whenOpen(() => select(activeItem.value)), COMMAND_PRIORITY_NORMAL),
  editor.registerCommand(KEY_ESCAPE_COMMAND, whenOpen(close), COMMAND_PRIORITY_NORMAL),
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
  match.value = null
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
watch(() => match.value?.nodeKey && match.value.end, () => {
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
      class="hlx-root hlx-slash-menu"
      role="listbox"
      aria-label="插入區塊"
      :data-variant="theme.variant"
      :data-color-scheme="theme.colorScheme"
      :style="[theme.style, floatingStyles]"
      @mousedown.prevent
    >
      <div
        v-for="(section, sectionIndex) in sections"
        :key="section.label ?? sectionIndex"
        role="group"
        :aria-label="section.label"
      >
        <div v-if="section.label" class="hlx-slash-group" aria-hidden="true">
          {{ section.label }}
        </div>
        <div
          v-for="item in section.items"
          :id="optionId(item)"
          :key="item.key"
          class="hlx-slash-item"
          role="option"
          :aria-selected="item === activeItem"
          @mousemove="activeIndex = flatItems.indexOf(item)"
          @click="select(item)"
        >
          <span class="hlx-slash-icon" aria-hidden="true">
            <component :is="item.icon" v-if="item.icon" :size="18" :stroke-width="1.75" />
          </span>
          <span class="hlx-slash-text">
            <span class="hlx-slash-title">{{ item.title }}</span>
            <span v-if="item.description" class="hlx-slash-description">{{ item.description }}</span>
          </span>
        </div>
      </div>
    </div>
  </Teleport>
</template>
