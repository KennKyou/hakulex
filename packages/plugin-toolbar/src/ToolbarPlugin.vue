<script setup lang="ts">
import type { BlockType } from '@hakulex/editor'
import type { EditorState, LexicalEditor, RangeSelection, TextFormatType } from 'lexical'
import type { Component } from 'vue'
import { $canTurnBlock, $getBlockType, $selectionBlockKeys, $turnBlocksInto, TURNABLE_BLOCK_TYPES, useEditorTheme } from '@hakulex/editor'
import { normalizeUrl } from '@hakulex/plugin-floating-toolbar'
import { builtinSlashItems } from '@hakulex/plugin-slash-menu'
import { useLexicalComposer, useLexicalEditable, useLexicalRegister } from '@hakulex/vue-lexical'
import { $isAutoLinkNode, $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import { $findMatchingParent, mergeRegister } from '@lexical/utils'
import { Bold, Check, ChevronDown, Code, Italic, Link, Plus, Redo2, Strikethrough, Subscript, Superscript, Underline, Undo2, Unlink, X } from '@lucide/vue'
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
} from 'lexical'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'

const props = defineProps<{
  /** Rejects link targets before they reach the editor; shows an error instead. */
  validateUrl?: (url: string) => boolean
}>()

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl+'

const FORMATS: { format: TextFormatType, label: string, shortcut?: string, icon: Component }[] = [
  {
    format: 'bold',
    label: '粗體',
    shortcut: `${mod}B`,
    icon: Bold,
  },
  {
    format: 'italic',
    label: '斜體',
    shortcut: `${mod}I`,
    icon: Italic,
  },
  {
    format: 'underline',
    label: '底線',
    shortcut: `${mod}U`,
    icon: Underline,
  },
  { format: 'strikethrough', label: '刪除線', icon: Strikethrough },
  { format: 'code', label: '行內程式碼', icon: Code },
  { format: 'superscript', label: '上標', icon: Superscript },
  { format: 'subscript', label: '下標', icon: Subscript },
]

// What the type menu already covers doesn't need to be offered twice.
const TEXT_ITEMS = new Set([
  'paragraph',
  'h1',
  'h2',
  'h3',
  'bullet-list',
  'numbered-list',
  'check-list',
  'quote',
])
const INSERT_ITEMS = builtinSlashItems.filter(item => !TEXT_ITEMS.has(item.key))

const outer = useLexicalComposer()
const editable = useLexicalEditable()
const theme = useEditorTheme()

interface State {
  /** A text selection or caret, which is what formats apply to. */
  hasText: boolean
  /** More than a caret, which is what a link needs. */
  hasRange: boolean
  formats: Set<TextFormatType>
  hasLink: boolean
  linkUrl: string
  turnable: boolean
  /** The selected blocks' type, 'mixed' if they differ, null if they have none. */
  blockType: BlockType | 'mixed' | null
}

const state = shallowRef<State>({
  hasText: false,
  hasRange: false,
  formats: new Set(),
  hasLink: false,
  linkUrl: '',
  turnable: false,
  blockType: null,
})
const canUndo = shallowRef(false)
const canRedo = shallowRef(false)

/*
 * Which editor this works on: the one the caret is in, which can be one inside the document.
 * Focus going to this toolbar's own controls leaves that as it was. History is shared, so
 * undo and redo don't need any of this.
 */
const active = shallowRef<LexicalEditor>(outer)
// In a field of its own, such as a step's title: there's no selection to work on.
const inField = shallowRef(false)

function syncActive() {
  const root = outer.getRootElement()
  const element = document.activeElement
  if (!root || !element || !root.contains(element))
    return
  const host = element.closest<HTMLElement & { __lexicalEditor?: LexicalEditor }>('[data-lexical-editor]')
  active.value = host?.__lexicalEditor ?? outer
  inField.value = element !== host && element.matches('input, textarea')
}

const insertItems = computed(() => INSERT_ITEMS.filter(item => !item.requires || active.value.hasNodes(item.requires)))

onMounted(() => document.addEventListener('focusin', syncActive))
onBeforeUnmount(() => document.removeEventListener('focusin', syncActive))

const typeLabel = computed(() => {
  const { blockType } = state.value
  if (blockType === 'mixed')
    return '多種'
  return TURNABLE_BLOCK_TYPES.find(item => item.type === blockType)?.label ?? '段落'
})

/** An unlinked autolink is plain text to the author, even though the node remains. */
const $linkOf = (selection: RangeSelection) => $findMatchingParent(selection.anchor.getNode(), node => $isLinkNode(node) && !($isAutoLinkNode(node) && node.getIsUnlinked()))

function $readState(): State {
  const selection = $getSelection()
  const blocks = $selectionBlockKeys().flatMap((key) => {
    const node = $getNodeByKey(key)
    return node && $canTurnBlock(node)
      ? [
          $getBlockType(node),
        ]
      : []
  })
  const blockType = new Set(blocks).size > 1
    ? 'mixed'
    : blocks[0] ?? null
  if (!$isRangeSelection(selection)) {
    return {
      hasText: false,
      hasRange: false,
      formats: new Set(),
      hasLink: false,
      linkUrl: '',
      turnable: false,
      blockType: null,
    }
  }
  const link = $linkOf(selection)
  return {
    hasText: true,
    hasRange: !selection.isCollapsed(),
    formats: new Set(FORMATS.map(item => item.format).filter(format => selection.hasFormat(format))),
    hasLink: $isLinkNode(link),
    linkUrl: $isLinkNode(link)
      ? link.getURL()
      : '',
    turnable: blocks.length > 0,
    blockType,
  }
}

useLexicalRegister(outer => mergeRegister(
  outer.registerCommand(CAN_UNDO_COMMAND, (value) => {
    canUndo.value = value
    return false
  }, COMMAND_PRIORITY_LOW),
  outer.registerCommand(CAN_REDO_COMMAND, (value) => {
    canRedo.value = value
    return false
  }, COMMAND_PRIORITY_LOW),
  // The one it was working on may have left the page with its block.
  outer.registerUpdateListener(() => {
    if (!active.value.getRootElement())
      active.value = outer
  }),
))

// Registers again when `active` changes: reading it here is what says so.
useLexicalRegister(() => {
  const editor = active.value
  const read = (editorState: EditorState) => {
    state.value = editorState.read($readState, { editor })
  }
  read(editor.getEditorState())
  return editor.registerUpdateListener(({ editorState }) => read(editorState))
})

/** Keeps the editor's selection when pressing controls. Inputs still need focus. */
function keepSelection(event: MouseEvent) {
  if (!(event.target instanceof HTMLInputElement))
    event.preventDefault()
}

const backToEditor = () => active.value.focus()

function turnInto(type: unknown) {
  active.value.update(() => $turnBlocksInto($selectionBlockKeys(), type as BlockType))
}

function insert(run: (typeof INSERT_ITEMS)[number]['run']) {
  const editor = active.value
  editor.update(() => {
    // Nowhere to go yet, or a block selected: the end of the document will do.
    if (!$isRangeSelection($getSelection()))
      $getRoot().selectEnd()
    run(editor)
  })
}

/* Link. Focus moves to the input, so the selection is kept for later. */

const linkInput = useTemplateRef<HTMLInputElement>('linkInput')
const linkOpen = shallowRef(false)
const linkDraft = shallowRef('')
const linkError = shallowRef(false)
let savedSelection: RangeSelection | null = null

function openLink() {
  active.value.getEditorState().read(() => {
    const selection = $getSelection()
    savedSelection = $isRangeSelection(selection)
      ? selection.clone()
      : null
  })
  if (!savedSelection)
    return
  linkDraft.value = state.value.linkUrl
  linkError.value = false
  linkOpen.value = true
  void nextTick(() => linkInput.value?.select())
}

function closeLink() {
  linkOpen.value = false
  savedSelection = null
  backToEditor()
}

function applyLink(url: string | null) {
  const selection = savedSelection
  if (selection) {
    const editor = active.value
    editor.update(() => {
      $setSelection(selection.clone())
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, url)
    })
  }
  closeLink()
}

function submitLink() {
  const url = normalizeUrl(linkDraft.value)
  if (!url) {
    // TOGGLE_LINK_COMMAND flips autolinks, so without a link to remove it would relink one.
    if (state.value.hasLink)
      applyLink(null)
    else
      closeLink()
    return
  }
  if (props.validateUrl && !props.validateUrl(url)) {
    linkError.value = true
    return
  }
  applyLink(url)
}
</script>

<template>
  <div
    v-if="editable"
    class="hlx-fixed-toolbar"
    role="toolbar"
    aria-label="編輯工具列"
    @mousedown="keepSelection"
  >
    <button
      type="button"
      class="hlx-fixed-toolbar-button"
      aria-label="復原"
      :title="`復原 (${mod}Z)`"
      :disabled="!canUndo"
      @click="outer.dispatchCommand(UNDO_COMMAND, undefined)"
    >
      <Undo2 :size="16" :stroke-width="2" />
    </button>
    <button
      type="button"
      class="hlx-fixed-toolbar-button"
      aria-label="重做"
      title="重做"
      :disabled="!canRedo"
      @click="outer.dispatchCommand(REDO_COMMAND, undefined)"
    >
      <Redo2 :size="16" :stroke-width="2" />
    </button>
    <span class="hlx-fixed-toolbar-divider" aria-hidden="true" />

    <DropdownMenuRoot :modal="false">
      <DropdownMenuTrigger class="hlx-fixed-toolbar-select" aria-label="區塊類型" title="區塊類型" :disabled="inField || !state.turnable">
        {{ typeLabel }} <ChevronDown :size="14" :stroke-width="2" />
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          class="hlx-root hlx-fixed-toolbar-menu"
          :data-variant="theme.variant"
          :data-color-scheme="theme.colorScheme"
          :style="theme.style"
          align="start"
          :side-offset="4"
          @close-auto-focus.prevent="backToEditor"
        >
          <DropdownMenuRadioGroup :model-value="state.blockType ?? undefined" @update:model-value="turnInto">
            <DropdownMenuRadioItem
              v-for="item in TURNABLE_BLOCK_TYPES"
              :key="item.type"
              class="hlx-fixed-toolbar-menu-item"
              :value="item.type"
            >
              {{ item.label }}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
    <span class="hlx-fixed-toolbar-divider" aria-hidden="true" />

    <button
      v-for="item in FORMATS"
      :key="item.format"
      type="button"
      class="hlx-fixed-toolbar-button"
      :aria-label="item.label"
      :aria-pressed="state.formats.has(item.format)"
      :title="item.shortcut ? `${item.label} (${item.shortcut})` : item.label"
      :disabled="inField || !state.hasText"
      @click="active.dispatchCommand(FORMAT_TEXT_COMMAND, item.format)"
    >
      <component :is="item.icon" :size="16" :stroke-width="2" />
    </button>
    <span class="hlx-fixed-toolbar-divider" aria-hidden="true" />

    <button
      type="button"
      class="hlx-fixed-toolbar-button"
      aria-label="連結"
      title="連結"
      :aria-pressed="state.hasLink"
      :disabled="inField || (!state.hasRange && !state.hasLink)"
      @click="openLink"
    >
      <Link :size="16" :stroke-width="2" />
    </button>

    <DropdownMenuRoot :modal="false">
      <DropdownMenuTrigger class="hlx-fixed-toolbar-select" aria-label="插入" title="插入" :disabled="inField">
        <Plus :size="14" :stroke-width="2" /> 插入 <ChevronDown :size="14" :stroke-width="2" />
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          class="hlx-root hlx-fixed-toolbar-menu"
          :data-variant="theme.variant"
          :data-color-scheme="theme.colorScheme"
          :style="theme.style"
          align="start"
          :side-offset="4"
          @close-auto-focus.prevent="backToEditor"
        >
          <DropdownMenuItem
            v-for="item in insertItems"
            :key="item.key"
            class="hlx-fixed-toolbar-menu-item"
            @select="insert(item.run)"
          >
            <component :is="item.icon" :size="14" :stroke-width="2" />
            {{ item.title }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>

    <form v-if="linkOpen" class="hlx-fixed-toolbar-link" @submit.prevent="submitLink" @keydown.esc.prevent="closeLink">
      <input
        ref="linkInput"
        v-model="linkDraft"
        class="hlx-fixed-toolbar-input"
        type="text"
        inputmode="url"
        placeholder="貼上或輸入網址"
        aria-label="網址"
        :aria-invalid="linkError"
        spellcheck="false"
        autocomplete="off"
        @input="linkError = false"
      >
      <button type="submit" class="hlx-fixed-toolbar-button" aria-label="套用連結" title="套用 (Enter)">
        <Check :size="16" :stroke-width="2" />
      </button>
      <button
        v-if="state.hasLink"
        type="button"
        class="hlx-fixed-toolbar-button"
        aria-label="移除連結"
        title="移除連結"
        @click="applyLink(null)"
      >
        <Unlink :size="16" :stroke-width="2" />
      </button>
      <button type="button" class="hlx-fixed-toolbar-button" aria-label="取消" title="取消 (Esc)" @click="closeLink">
        <X :size="16" :stroke-width="2" />
      </button>
      <p v-if="linkError" class="hlx-fixed-toolbar-error" role="alert">
        這個網址無法使用
      </p>
    </form>
  </div>
</template>
