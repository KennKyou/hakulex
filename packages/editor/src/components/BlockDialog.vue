<script setup lang="ts">
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { shallowRef, useTemplateRef } from 'vue'
import { useEditorTheme } from '../theme-context'

const props = defineProps<{
  title: string
  description: string
  /** Has the draft changed? Leaving then asks first. */
  dirty: boolean
  /** Something is going on that saving has to wait for. */
  busy?: boolean
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

function leave() {
  if (props.dirty)
    confirming.value = true
  else
    emit('cancel')
}

function onOpenChange(open: boolean) {
  if (!open)
    leave()
}

function onEscape(event: KeyboardEvent) {
  event.preventDefault()
  // The Esc that closes the word list isn't ours.
  if (event.isComposing)
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

function focusFirst(event: Event) {
  event.preventDefault()
  content.value?.$el.querySelector<HTMLElement>('[data-autofocus], input, textarea')?.focus()
}
</script>

<template>
  <DialogRoot :open="true" @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay class="hlx-dialog-overlay" />
      <DialogContent
        ref="content"
        class="hlx-root hlx-dialog hlx-block-dialog"
        :data-variant="theme.variant"
        :data-color-scheme="theme.colorScheme"
        :style="theme.style"
        @open-auto-focus="focusFirst"
        @close-auto-focus.prevent
        @escape-key-down="onEscape"
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
