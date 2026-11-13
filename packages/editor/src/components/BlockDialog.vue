<script setup lang="ts">
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { nextTick, shallowRef, useTemplateRef, watch } from 'vue'
import { useEditorTheme } from '../theme-context'

const props = defineProps<{
  title: string
  description: string
  /** Has the draft changed? Leaving then asks first. */
  dirty: boolean
  /** Something is going on that saving has to wait for. */
  busy?: boolean
  /**
   * The site's own dialog is over this one, as while `pickImages` runs: this one stops holding
   * focus and leaves Esc and clicks outside alone. Afterwards focus goes back to the element
   * marked `data-return-focus`.
   */
  away?: boolean
}>()
const emit = defineEmits<{ save: [], cancel: [] }>()

defineSlots<{
  default?: () => unknown
  /** Next to the buttons, for what describes the draft. */
  status?: () => unknown
}>()

const theme = useEditorTheme()
const content = useTemplateRef<{ $el: HTMLElement }>('content')
const confirming = shallowRef(false)

// Modal holds focus inside and blocks the page; the site's dialog needs both.
let returning = false
watch(() => props.away, async (away, was) => {
  if (away || !was)
    return
  returning = true
  await nextTick()
  returnFocus()
})

function returnFocus() {
  if (!returning)
    return false
  returning = false
  const target = content.value?.$el.querySelector<HTMLElement>('[data-return-focus]')
  target?.focus()
  return !!target
}

function leave() {
  if (props.dirty)
    confirming.value = true
  else
    emit('cancel')
}

function onOpenChange(open: boolean) {
  if (!open && !props.away)
    leave()
}

function onEscape(event: KeyboardEvent) {
  event.preventDefault()
  // The Esc that closes the word list isn't ours, nor the one in the site's dialog.
  if (event.isComposing || props.away)
    return
  if (confirming.value)
    confirming.value = false
  else
    leave()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.isComposing) {
    event.preventDefault()
    event.stopPropagation()
    if (!props.busy)
      emit('save')
  }
}

function onInteractOutside(event: Event) {
  if (props.away)
    event.preventDefault()
}

function focusFirst(event: Event) {
  event.preventDefault()
  if (props.away || returnFocus())
    return
  content.value?.$el.querySelector<HTMLElement>('[data-autofocus], input, textarea')?.focus()
}
</script>

<template>
  <DialogRoot :open="true" :modal="!away" @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay class="hlx-dialog-overlay" />
      <!-- Reka draws its overlay only for a modal dialog. -->
      <div v-if="away" class="hlx-dialog-overlay" />
      <DialogContent
        ref="content"
        class="hlx-root hlx-dialog hlx-block-dialog"
        :data-variant="theme.variant"
        :data-color-scheme="theme.colorScheme"
        :style="theme.style"
        @open-auto-focus="focusFirst"
        @close-auto-focus.prevent
        @escape-key-down="onEscape"
        @interact-outside="onInteractOutside"
        @keydown.capture="onKeydown"
      >
        <div class="hlx-dialog-head">
          <DialogTitle class="hlx-block-dialog-title">
            {{ title }}
          </DialogTitle>
        </div>
        <DialogDescription class="hlx-visually-hidden">
          {{ description }}
        </DialogDescription>
        <div class="hlx-block-dialog-body">
          <slot />
        </div>
        <div v-if="confirming" class="hlx-dialog-foot hlx-block-dialog-footer hlx-block-dialog-confirm" role="alert">
          <span class="hlx-block-dialog-status">有未儲存的修改</span>
          <button type="button" @click="confirming = false">
            繼續編輯
          </button>
          <button type="button" data-danger @click="emit('cancel')">
            放棄
          </button>
        </div>
        <div v-else class="hlx-dialog-foot hlx-block-dialog-footer">
          <span class="hlx-block-dialog-status"><slot name="status" /></span>
          <button type="button" @click="leave">
            取消
          </button>
          <button type="button" data-primary :disabled="busy" @click="emit('save')">
            儲存
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
