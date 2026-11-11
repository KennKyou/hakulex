<script setup lang="ts">
import type { VirtualElement } from '@floating-ui/vue'
import type { RangeSelection } from 'lexical'
import type { ToolbarFormat } from './selection-state'
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/vue'
import { SET_RUBY_COMMAND, TOGGLE_SPOILER_COMMAND, useEditorTheme } from '@hakulex/editor'
import { useLexicalComposer, useLexicalRegister } from '@hakulex/vue-lexical'
import { TOGGLE_LINK_COMMAND } from '@lexical/link'
import { Bold, Check, Code, EyeOff, Italic, Languages, Link, RemoveFormatting, Strikethrough, Subscript, Superscript, Underline, Unlink, X } from '@lucide/vue'
import {
  $getSelection,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_NORMAL,
  FORMAT_TEXT_COMMAND,
  KEY_MODIFIER_COMMAND,
} from 'lexical'
import { computed, nextTick, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'
import { $clearFormatting, normalizeUrl } from './selection-state'
import { useToolbarVisibility } from './useToolbarVisibility'

const props = defineProps<{
  /** Rejects link targets before they reach the editor; shows an error instead. */
  validateUrl?: (url: string) => boolean
}>()

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl+'

const FORMAT_BUTTONS: { format: ToolbarFormat, label: string, shortcut: string, icon: typeof Bold }[] = [
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
  {
    format: 'strikethrough',
    label: '刪除線',
    shortcut: '',
    icon: Strikethrough,
  },
  {
    format: 'code',
    label: '行內程式碼',
    shortcut: '',
    icon: Code,
  },
  {
    format: 'superscript',
    label: '上標',
    shortcut: '',
    icon: Superscript,
  },
  {
    format: 'subscript',
    label: '下標',
    shortcut: '',
    icon: Subscript,
  },
]

const editor = useLexicalComposer()
const toolbar = useTemplateRef<HTMLDivElement>('toolbar')
const linkInput = useTemplateRef<HTMLInputElement>('linkInput')
const rubyInput = useTemplateRef<HTMLInputElement>('rubyInput')
const { visible, state, revision } = useToolbarVisibility(toolbar)

const mode = shallowRef<'format' | 'link' | 'ruby'>('format')
const linkDraft = shallowRef('')
const rubyDraft = shallowRef('')
const linkError = shallowRef(false)
let savedSelection: RangeSelection | null = null

const shown = computed(() => visible.value || mode.value !== 'format')

// The toolbar is teleported to <body>; copy the editor's theme so tokens resolve the same.
const theme = useEditorTheme()

/* Positioning: anchor to the DOM selection, falling back to the last rect while
   focus is in the link input (the DOM selection is gone by then). */
let lastRect: DOMRect | null = null
function selectionRect(): DOMRect {
  const root = editor.getRootElement()
  const domSelection = root?.ownerDocument.getSelection()
  if (root && domSelection && domSelection.rangeCount > 0) {
    const range = domSelection.getRangeAt(0)
    if (root.contains(range.commonAncestorContainer)) {
      const rect = range.getBoundingClientRect()
      if (rect.width || rect.height)
        lastRect = rect
    }
  }
  return lastRect ?? new DOMRect()
}

const reference = shallowRef<VirtualElement | null>(null)
watch(revision, () => {
  reference.value = {
    getBoundingClientRect: selectionRect,
    contextElement: editor.getRootElement() ?? undefined,
  }
})

/** A fixed toolbar on the same editor still has to be reachable, so this stays out of its way. */
function fixedToolbarBottom() {
  // The document sits in its own box inside the editor; the toolbar is beside that box.
  const root = editor.getRootElement()
  const fixed = (root?.closest('.hlx-editor-body') ?? root)?.parentElement?.querySelector('.hlx-fixed-toolbar')
  return fixed
    ? fixed.getBoundingClientRect().bottom + 8
    : 8
}

const { floatingStyles, placement } = useFloating(reference, toolbar, {
  open: shown,
  strategy: 'fixed',
  placement: 'top',
  middleware: [
    offset(8),
    flip(() => ({
      padding: {
        top: fixedToolbarBottom(),
      },
    })),
    shift(() => ({
      padding: {
        top: fixedToolbarBottom(),
        right: 8,
        bottom: 8,
        left: 8,
      },
    })),
  ],
  whileElementsMounted: autoUpdate,
})

function toggleFormat(format: ToolbarFormat) {
  editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)
}

function clearFormatting() {
  editor.update(() => {
    const selection = $getSelection()
    if ($isRangeSelection(selection))
      $clearFormatting(selection)
  })
}

function toggleSpoiler() {
  editor.dispatchCommand(TOGGLE_SPOILER_COMMAND, undefined)
}

/* Link and reading editing: focus moves to an input, so the selection is kept for later. */

function saveSelection(): boolean {
  editor.getEditorState().read(() => {
    const selection = $getSelection()
    savedSelection = $isRangeSelection(selection)
      ? selection.clone()
      : null
  })
  return savedSelection !== null
}

function closeForm(refocus: boolean) {
  mode.value = 'format'
  savedSelection = null
  if (refocus)
    editor.focus()
}

function openLink() {
  if (!saveSelection())
    return
  linkDraft.value = state.value?.linkUrl ?? ''
  linkError.value = false
  mode.value = 'link'
  nextTick(() => linkInput.value?.select())
}

function setLink(url: string | null) {
  const selection = savedSelection
  if (!selection)
    return
  editor.update(() => {
    $setSelection(selection.clone())
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, url)
  })
  closeForm(true)
}

function submitLink() {
  const url = normalizeUrl(linkDraft.value)
  if (!url) {
    // TOGGLE_LINK_COMMAND flips autolinks, so without a link to remove it would relink one.
    if (state.value?.hasLink)
      setLink(null)
    else
      closeForm(true)
    return
  }
  if (props.validateUrl && !props.validateUrl(url)) {
    linkError.value = true
    return
  }
  setLink(url)
}

function openRuby() {
  if (!saveSelection())
    return
  rubyDraft.value = state.value?.rubyReading ?? ''
  mode.value = 'ruby'
  nextTick(() => rubyInput.value?.select())
}

function setRuby(reading: string) {
  const selection = savedSelection
  if (selection) {
    editor.update(() => {
      $setSelection(selection.clone())
      editor.dispatchCommand(SET_RUBY_COMMAND, reading)
    })
  }
  closeForm(true)
}

// ⌘K / Ctrl+K opens the link editor for the current selection.
useLexicalRegister(editor => editor.registerCommand(KEY_MODIFIER_COMMAND, (event) => {
  const isLinkShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
  if (!isLinkShortcut || !visible.value)
    return false
  event.preventDefault()
  openLink()
  return true
}, COMMAND_PRIORITY_NORMAL))

// Clicking anywhere outside the toolbar abandons an open edit.
function onDocumentPointerDown(event: PointerEvent) {
  if (mode.value !== 'format' && !toolbar.value?.contains(event.target as Node))
    closeForm(false)
}
watch(mode, (value) => {
  if (value !== 'format')
    document.addEventListener('pointerdown', onDocumentPointerDown, true)
  else
    document.removeEventListener('pointerdown', onDocumentPointerDown, true)
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown, true))

/** Keep the editor's selection when clicking buttons; inputs still need focus. */
function keepEditorFocus(event: MouseEvent) {
  if (!(event.target instanceof HTMLInputElement))
    event.preventDefault()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="shown"
      ref="toolbar"
      class="hlx-root hlx-floating-toolbar"
      role="toolbar"
      aria-label="文字格式"
      :data-variant="theme.variant"
      :data-color-scheme="theme.colorScheme"
      :data-placement="placement"
      :style="[theme.style, floatingStyles]"
      @mousedown="keepEditorFocus"
    >
      <template v-if="mode === 'format' && state">
        <button
          v-for="item in FORMAT_BUTTONS"
          :key="item.format"
          type="button"
          class="hlx-toolbar-button"
          :aria-label="item.label"
          :aria-pressed="state.formats[item.format]"
          :title="item.shortcut ? `${item.label} (${item.shortcut})` : item.label"
          @click="toggleFormat(item.format)"
        >
          <component :is="item.icon" :size="16" :stroke-width="2" />
        </button>
        <button
          type="button"
          class="hlx-toolbar-button"
          aria-label="清除格式"
          title="清除格式"
          @click="clearFormatting"
        >
          <RemoveFormatting :size="16" :stroke-width="2" />
        </button>
        <span class="hlx-toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          class="hlx-toolbar-button"
          aria-label="連結"
          :aria-pressed="state.hasLink"
          :title="`連結 (${mod}K)`"
          @click="openLink"
        >
          <Link :size="16" :stroke-width="2" />
        </button>
        <button
          type="button"
          class="hlx-toolbar-button"
          aria-label="Spoiler"
          :aria-pressed="state.inSpoiler"
          title="Spoiler"
          @click="toggleSpoiler"
        >
          <EyeOff :size="16" :stroke-width="2" />
        </button>
        <button
          type="button"
          class="hlx-toolbar-button"
          aria-label="Ruby 注音"
          :aria-pressed="state.hasRuby"
          :disabled="!state.canApplyRuby"
          :title="state.canApplyRuby ? 'Ruby 注音' : 'Ruby 注音只能用在同一行的文字'"
          @click="openRuby"
        >
          <Languages :size="16" :stroke-width="2" />
        </button>
      </template>

      <form v-else-if="mode === 'ruby'" class="hlx-toolbar-link" @submit.prevent="setRuby(rubyDraft)" @keydown.esc.prevent="closeForm(true)">
        <input
          ref="rubyInput"
          v-model="rubyDraft"
          class="hlx-toolbar-input"
          type="text"
          placeholder="輸入讀音"
          aria-label="讀音"
          spellcheck="false"
          autocomplete="off"
        >
        <button type="submit" class="hlx-toolbar-button" aria-label="套用讀音" title="套用 (Enter)">
          <Check :size="16" :stroke-width="2" />
        </button>
        <button
          v-if="state?.hasRuby"
          type="button"
          class="hlx-toolbar-button"
          aria-label="移除讀音"
          title="移除讀音"
          @click="setRuby('')"
        >
          <Unlink :size="16" :stroke-width="2" />
        </button>
        <button type="button" class="hlx-toolbar-button" aria-label="取消" title="取消 (Esc)" @click="closeForm(true)">
          <X :size="16" :stroke-width="2" />
        </button>
      </form>

      <form v-else class="hlx-toolbar-link" @submit.prevent="submitLink" @keydown.esc.prevent="closeForm(true)">
        <input
          ref="linkInput"
          v-model="linkDraft"
          class="hlx-toolbar-input"
          type="text"
          inputmode="url"
          placeholder="貼上或輸入網址"
          aria-label="網址"
          :aria-invalid="linkError"
          spellcheck="false"
          autocomplete="off"
          @input="linkError = false"
        >
        <button type="submit" class="hlx-toolbar-button" aria-label="套用連結" title="套用 (Enter)">
          <Check :size="16" :stroke-width="2" />
        </button>
        <button
          v-if="state?.hasLink"
          type="button"
          class="hlx-toolbar-button"
          aria-label="移除連結"
          title="移除連結"
          @click="setLink(null)"
        >
          <Unlink :size="16" :stroke-width="2" />
        </button>
        <button type="button" class="hlx-toolbar-button" aria-label="取消" title="取消 (Esc)" @click="closeForm(true)">
          <X :size="16" :stroke-width="2" />
        </button>
        <p v-if="linkError" class="hlx-toolbar-error" role="alert">
          這個網址無法使用
        </p>
      </form>
    </div>
  </Teleport>
</template>
