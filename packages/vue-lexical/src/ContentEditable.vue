<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'
import { useCanShowPlaceholder } from './composables/useCanShowPlaceholder'
import { useLexicalEditable } from './composables/useLexicalEditable'
import { useLexicalComposer } from './composer'

defineOptions({ inheritAttrs: false })

defineProps<{
  /** Text shown while the document is empty. The `placeholder` slot overrides it. */
  placeholder?: string
}>()

defineSlots<{
  placeholder?: () => unknown
}>()

const editor = useLexicalComposer()
const editable = useLexicalEditable()
const showPlaceholder = useCanShowPlaceholder()
const root = useTemplateRef<HTMLDivElement>('root')

onMounted(() => editor.setRootElement(root.value))
onBeforeUnmount(() => editor.setRootElement(null))
</script>

<template>
  <!-- Lexical owns this element's children; Vue only patches its attributes. -->
  <div
    ref="root"
    v-bind="$attrs"
    :contenteditable="editable"
    role="textbox"
    aria-multiline="true"
    :aria-readonly="!editable"
    spellcheck="true"
  />
  <div
    v-if="showPlaceholder && (placeholder || $slots.placeholder)"
    aria-hidden="true"
    data-lexical-placeholder
  >
    <slot name="placeholder">
      {{ placeholder }}
    </slot>
  </div>
</template>
