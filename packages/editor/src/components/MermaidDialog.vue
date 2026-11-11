<script setup lang="ts">
import { MermaidView } from '@hakulex/renderer'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'
import { MERMAID_TEMPLATES } from '../mermaid/templates'
import { useEditorTheme } from '../theme-context'

const props = defineProps<{ source: string }>()
const emit = defineEmits<{ save: [source: string], cancel: [] }>()
const open = defineModel<boolean>('open', { required: true })

const theme = useEditorTheme()
const textarea = useTemplateRef<HTMLTextAreaElement>('textarea')
const draft = shallowRef('')
// The preview lags typing a little so a large diagram doesn't re-layout per keystroke.
const preview = shallowRef('')
let previewTimer: ReturnType<typeof setTimeout> | undefined

watch(open, (value) => {
  if (!value)
    return
  draft.value = props.source
  preview.value = props.source
})
watch(draft, (value) => {
  clearTimeout(previewTimer)
  previewTimer = setTimeout(() => (preview.value = value), 250)
})
onBeforeUnmount(() => clearTimeout(previewTimer))

function applyTemplate(source: string) {
  draft.value = source
  preview.value = source
  textarea.value?.focus()
}

// Saving and cancelling both close the dialog; whichever happened first wins.
let settled = false
watch(open, (value) => {
  if (value)
    settled = false
})
function save() {
  settled = true
  open.value = false
  emit('save', draft.value)
}
function onOpenChange(value: boolean) {
  open.value = value
  if (!value && !settled) {
    settled = true
    emit('cancel')
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    save()
    return
  }
  // Two-space indent instead of moving focus.
  if (event.key === 'Tab' && !event.shiftKey) {
    event.preventDefault()
    const el = event.target as HTMLTextAreaElement
    const { selectionStart: start, selectionEnd: end } = el
    draft.value = `${draft.value.slice(0, start)}  ${draft.value.slice(end)}`
    requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2))
  }
}
</script>

<template>
  <DialogRoot :open="open" @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay class="hlx-dialog-overlay" />
      <DialogContent
        class="hlx-root hlx-dialog hlx-mermaid-dialog"
        :data-variant="theme.variant"
        :data-color-scheme="theme.colorScheme"
        :style="theme.style"
        @open-auto-focus.prevent="textarea?.focus()"
      >
        <header class="hlx-dialog-head hlx-mermaid-dialog-header">
          <DialogTitle class="hlx-mermaid-dialog-title">
            Mermaid 圖表
          </DialogTitle>
          <DialogDescription class="hlx-visually-hidden">
            左邊編輯 Mermaid 原始碼，右邊即時預覽。
          </DialogDescription>
          <div class="hlx-mermaid-templates" role="group" aria-label="範本">
            <button
              v-for="template in MERMAID_TEMPLATES"
              :key="template.label"
              type="button"
              class="hlx-mermaid-chip"
              @click="applyTemplate(template.source)"
            >
              {{ template.label }}
            </button>
          </div>
        </header>
        <div class="hlx-mermaid-dialog-body">
          <textarea
            ref="textarea"
            v-model="draft"
            class="hlx-mermaid-source"
            spellcheck="false"
            autocomplete="off"
            aria-label="Mermaid 原始碼"
            placeholder="flowchart TD&#10;  A --> B"
            @keydown="onKeydown"
          />
          <div class="hlx-mermaid-preview" aria-live="polite">
            <MermaidView v-if="preview.trim()" :key="preview" :source="preview" />
            <p v-else class="hlx-mermaid-preview-empty">
              輸入原始碼或選一個範本
            </p>
          </div>
        </div>
        <footer class="hlx-dialog-foot hlx-mermaid-dialog-footer">
          <span class="hlx-mermaid-hint">⌘Enter 儲存 · Esc 取消</span>
          <DialogClose class="hlx-math-button">
            取消
          </DialogClose>
          <button type="button" class="hlx-math-button" data-primary @click="save">
            儲存
          </button>
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
