<script setup lang="ts">
import type { LinkNode } from '@lexical/link'
import type { LexicalNode } from 'lexical'
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/vue'
import { $createLinkCardNode, LinkCardSettingsKey, matchLinkCard, useEditorTheme } from '@hakulex/editor'
import { normalizeUrl } from '@hakulex/plugin-floating-toolbar'
import { useLexicalComposer, useLexicalRegister } from '@hakulex/vue-lexical'
import { $isAutoLinkNode, $isLinkNode } from '@lexical/link'
import { mergeRegister } from '@lexical/utils'
import { Check, Copy, ExternalLink, Globe, Pencil, Unlink } from '@lucide/vue'
import {
  $addUpdateTag,
  $createNodeSelection,
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isRootNode,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  COMMAND_PRIORITY_NORMAL,
  HISTORY_PUSH_TAG,
  KEY_DOWN_COMMAND,
  SELECTION_CHANGE_COMMAND,
  SKIP_DOM_SELECTION_TAG,
} from 'lexical'
import { computed, inject, nextTick, onBeforeUnmount, onMounted, shallowRef, useId, useTemplateRef } from 'vue'
import { displayUrl, isEmptyLink, middleTruncate } from './link-display'
import { registerModClick } from './mod-click'

const props = defineProps<{
  /** Rejects link targets before they reach the editor; shows an error instead. */
  validateUrl?: (url: string) => boolean
}>()

/*
 * The link under the caret, in a panel below it: its
 * text and address, and buttons to open, copy, edit and remove it. Only for a caret: a
 * selection gets the floating toolbar instead.
 */

const editor = useLexicalComposer()
const theme = useEditorTheme()
const panel = useTemplateRef<HTMLDivElement>('panel')
const urlInput = useTemplateRef<HTMLInputElement>('urlInput')
const id = useId()

interface Shown {
  key: string
  url: string
  text: string
  /** The only thing on a top-level line, so the line can become a card. */
  alone: boolean
}
const shown = shallowRef<Shown | null>(null)
const anchor = shallowRef<HTMLElement | null>(null)
const copied = shallowRef(false)
const mode = shallowRef<'view' | 'edit'>('view')
const draft = shallowRef({ text: '', url: '' })
const invalid = shallowRef(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

/** The link a node is in. An autolink that was unlinked reads as plain text. */
function $linkOf(node: LexicalNode): LinkNode | null {
  for (let current: LexicalNode | null = node; current; current = current.getParent()) {
    if ($isLinkNode(current)) {
      return $isAutoLinkNode(current) && current.getIsUnlinked()
        ? null
        : current
    }
  }
  return null
}

function focusedHere() {
  const active = document.activeElement
  const root = editor.getRootElement()
  return !!active && (!!root?.contains(active) || !!panel.value?.contains(active))
}

function $refresh() {
  // While editing, the form keeps the link it was opened on. Focus moves between its fields and
  // buttons (and briefly nowhere, as a pressed button goes away); leaving it ends the editing.
  if (mode.value === 'edit' && shown.value && editor.isEditable())
    return
  const selection = $getSelection()
  const link = editor.isEditable() && focusedHere() && $isRangeSelection(selection) && selection.isCollapsed()
    ? $linkOf(selection.anchor.getNode())
    : null
  if (!link) {
    shown.value = null
    mode.value = 'view'
    return
  }
  const key = link.getKey()
  const fresh = shown.value?.key !== key
  const line = link.getParent()
  shown.value = {
    key,
    url: link.getURL(),
    text: link.getTextContent(),
    alone: $isParagraphNode(line) && $isRootNode(line.getParent()) && line.getChildrenSize() === 1,
  }
  anchor.value = editor.getElementByKey(key)
  if (fresh) {
    copied.value = false
    // A link with no address yet is there to be filled in.
    if (isEmptyLink(shown.value.url))
      startEditing()
    else
      mode.value = 'view'
  }
}
const refresh = () => editor.getEditorState().read($refresh)

useLexicalRegister(editor => mergeRegister(
  editor.registerCommand(SELECTION_CHANGE_COMMAND, () => {
    $refresh()
    return false
  }, COMMAND_PRIORITY_LOW),
  editor.registerUpdateListener(refresh),
  editor.registerEditableListener((editable) => {
    if (!editable)
      mode.value = 'view'
    refresh()
  }),
  registerModClick(editor),
  // ⌘K (Ctrl+K) with the caret in a link edits it. A selection is the floating toolbar's.
  // On the key itself, not on KEY_MODIFIER_COMMAND: Lexical sends that one after it has run its
  // own shortcuts, and after an undo or a redo that is after the state was committed, which it
  // then warns about.
  editor.registerCommand(KEY_DOWN_COMMAND, (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k' || !shown.value)
      return false
    event.preventDefault()
    startEditing()
    return true
  }, COMMAND_PRIORITY_NORMAL),
))

// Focus leaving for anything but the panel puts it away; checked once focus has landed.
function onFocusChange() {
  setTimeout(refresh, 0)
}
onMounted(() => {
  document.addEventListener('focusin', onFocusChange)
  document.addEventListener('focusout', onFocusChange)
})
onBeforeUnmount(() => {
  document.removeEventListener('focusin', onFocusChange)
  document.removeEventListener('focusout', onFocusChange)
  clearTimeout(copiedTimer)
})

const { floatingStyles } = useFloating(anchor, panel, {
  open: computed(() => !!shown.value),
  strategy: 'fixed',
  placement: 'bottom',
  middleware: [
    offset(8),
    flip({ padding: 8 }),
    shift({ padding: 8 }),
  ],
  whileElementsMounted: autoUpdate,
})

const empty = computed(() => isEmptyLink(shown.value?.url ?? ''))
const title = computed(() => shown.value?.text.trim() || displayUrl(shown.value?.url ?? ''))
const address = computed(() => middleTruncate(displayUrl(shown.value?.url ?? ''), 56))

/* Actions */

function openLink() {
  if (shown.value && !empty.value)
    window.open(shown.value.url, '_blank', 'noopener,noreferrer')
}

function copyLink() {
  const url = shown.value?.url
  if (!url || empty.value)
    return
  void navigator.clipboard?.writeText(url).then(() => {
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      copied.value = false
    }, 1500)
  })
}

function removeLink() {
  const key = shown.value?.key
  if (!key)
    return
  editor.update(() => {
    const node = $getNodeByKey(key)
    if (!$isLinkNode(node))
      return
    if ($isAutoLinkNode(node)) {
      node.setIsUnlinked(true)
      node.markDirty()
      return
    }
    for (const child of node.getChildren())
      node.insertBefore(child)
    node.remove()
  })
  shown.value = null
}

/*
 * A link alone on its line, to an address a link card source knows, can be that card instead:
 * the 「Link | Card」 switch. It replaces the whole line, so only a line holding just
 * the link is offered here, and nothing else on it is lost.
 */
const linkCards = inject(LinkCardSettingsKey, () => undefined)
const canBeCard = computed(() => {
  const settings = linkCards()
  return !!shown.value?.alone && settings?.enabled !== false && !!matchLinkCard(shown.value.url, settings?.providers)
})

function makeCard() {
  const key = shown.value?.key
  if (!key)
    return
  editor.update(() => {
    const link = $getNodeByKey(key)
    const line = link?.getParent()
    if (!$isLinkNode(link) || !$isParagraphNode(line))
      return
    const card = $createLinkCardNode({
      url: link.getURL(),
    })
    line.replace(card)
    const selection = $createNodeSelection()
    selection.add(card.getKey())
    $setSelection(selection)
  }, { tag: HISTORY_PUSH_TAG })
  shown.value = null
  mode.value = 'view'
}

/* Editing */

function startEditing() {
  if (!shown.value)
    return
  draft.value = { text: shown.value.text, url: shown.value.url }
  invalid.value = false
  mode.value = 'edit'
  nextTick(() => urlInput.value?.focus())
}

const canSave = computed(() => !isEmptyLink(draft.value.url))

/**
 * Writes the draft to the link, text and address in one undo step. False if it can't. With
 * `quiet`, the page's selection is left alone, so focus stays wherever it went.
 */
function commit(quiet = false): boolean {
  const key = shown.value?.key
  const url = normalizeUrl(draft.value.url)
  if (!key || isEmptyLink(url))
    return false
  if (props.validateUrl && !props.validateUrl(url)) {
    invalid.value = true
    return false
  }
  const text = draft.value.text
  editor.update(() => {
    if (quiet)
      $addUpdateTag(SKIP_DOM_SELECTION_TAG)
    const node = $getNodeByKey(key)
    if (!$isLinkNode(node))
      return
    if (node.getURL() !== url)
      node.setURL(url)
    // A new text takes the format of the first piece of the old one.
    if (text.trim() && node.getTextContent() !== text) {
      const first = node.getFirstDescendant()
      const next = $createTextNode(text)
      if ($isTextNode(first)) {
        next.setFormat(first.getFormat())
        next.setStyle(first.getStyle())
      }
      const previous = node.getChildren()
      node.append(next)
      for (const child of previous)
        child.remove()
    }
  })
  return true
}

/** Back to the caret in the link. Lexical puts the selection back; the root takes focus. */
function returnToEditor() {
  editor.getRootElement()?.focus({ preventScroll: true })
  editor.focus()
}

function save() {
  if (!commit())
    return
  mode.value = 'view'
  returnToEditor()
}

function cancel() {
  invalid.value = false
  if (isEmptyLink(shown.value?.url ?? '')) {
    mode.value = 'view'
    returnToEditor()
    return
  }
  mode.value = 'view'
  nextTick(() => panel.value?.querySelector<HTMLElement>('[data-link-action="edit"]')?.focus())
}

function onFieldKeyDown(event: KeyboardEvent) {
  if (event.isComposing)
    return
  if (event.key === 'Enter') {
    event.preventDefault()
    save()
  }
  else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    cancel()
  }
}

function setDraft(field: 'text' | 'url', event: Event) {
  draft.value = { ...draft.value, [field]: (event.target as HTMLInputElement).value }
  if (field === 'url')
    invalid.value = false
}

/** Focus leaving the panel for elsewhere keeps what was typed, if it can be kept. */
function onPanelFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  // Nowhere yet: a pressed button going away, with the next field about to take focus.
  if (mode.value !== 'edit' || !next || panel.value?.contains(next))
    return
  commit(true)
  mode.value = 'view'
  refresh()
}

/** Pressing a button keeps focus, and so the caret, in the editor. */
function keepEditorFocus(event: MouseEvent) {
  if (!(event.target instanceof HTMLInputElement))
    event.preventDefault()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="shown"
      ref="panel"
      class="hlx-root hlx-link-panel"
      role="dialog"
      aria-label="連結"
      :data-variant="theme.variant"
      :data-color-scheme="theme.colorScheme"
      :style="[theme.style, floatingStyles]"
      @mousedown="keepEditorFocus"
      @focusout="onPanelFocusOut"
    >
      <form v-if="mode === 'edit'" class="hlx-link-panel-form" @submit.prevent="save">
        <label class="hlx-link-panel-field" :for="`${id}-text`">
          <span>文字</span>
          <input
            :id="`${id}-text`"
            type="text"
            aria-label="連結文字"
            placeholder="連結文字"
            :value="draft.text"
            @input="setDraft('text', $event)"
            @keydown="onFieldKeyDown"
          >
        </label>
        <label class="hlx-link-panel-field" :for="`${id}-url`">
          <span>網址</span>
          <input
            :id="`${id}-url`"
            ref="urlInput"
            type="url"
            aria-label="網址"
            placeholder="貼上或輸入網址"
            :value="draft.url"
            :aria-invalid="invalid"
            :aria-describedby="invalid ? `${id}-error` : undefined"
            @input="setDraft('url', $event)"
            @keydown="onFieldKeyDown"
          >
        </label>
        <p v-if="invalid" :id="`${id}-error`" class="hlx-link-panel-error" role="alert">
          這個網址不能使用
        </p>
        <div class="hlx-link-panel-foot">
          <button type="button" class="hlx-link-panel-text-button" aria-label="取消" @click="cancel">
            取消
          </button>
          <button type="submit" class="hlx-link-panel-text-button" data-primary aria-label="儲存" :disabled="!canSave">
            儲存
          </button>
        </div>
      </form>
      <div v-else class="hlx-link-panel-preview">
        <span class="hlx-link-panel-tile" aria-hidden="true"><Globe :size="16" :stroke-width="2" /></span>
        <div class="hlx-link-panel-meta">
          <div class="hlx-link-panel-title" :data-empty="empty || undefined">
            {{ empty ? '還沒有網址' : title }}
          </div>
          <div v-if="!empty" class="hlx-link-panel-url" :title="shown.url">
            {{ address }}
          </div>
        </div>
      </div>
      <div v-if="mode === 'view'" class="hlx-link-panel-actions">
        <div v-if="canBeCard" class="hlx-link-panel-kinds" role="group" aria-label="連結或卡片">
          <button type="button" class="hlx-link-panel-kind" aria-pressed="true">
            連結
          </button>
          <button type="button" class="hlx-link-panel-kind" aria-pressed="false" @click="makeCard">
            卡片
          </button>
        </div>
        <span class="hlx-link-panel-spacer" />
        <button type="button" class="hlx-link-panel-button" aria-label="開啟連結" title="開啟連結" :disabled="empty" @click="openLink">
          <ExternalLink :size="15" :stroke-width="2" />
        </button>
        <button
          type="button"
          class="hlx-link-panel-button"
          :aria-label="copied ? '已複製' : '複製網址'"
          :title="copied ? '已複製' : '複製網址'"
          :disabled="empty"
          @click="copyLink"
        >
          <component :is="copied ? Check : Copy" :size="15" :stroke-width="2" />
        </button>
        <button type="button" class="hlx-link-panel-button" aria-label="編輯連結" title="編輯連結" data-link-action="edit" @click="startEditing">
          <Pencil :size="15" :stroke-width="2" />
        </button>
        <button type="button" class="hlx-link-panel-button" data-danger aria-label="移除連結" title="移除連結" @click="removeLink">
          <Unlink :size="15" :stroke-width="2" />
        </button>
      </div>
    </div>
  </Teleport>
</template>
