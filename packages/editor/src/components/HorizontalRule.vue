<script setup lang="ts">
import { HorizontalRuleView } from '@hakulex/renderer'
import { useLexicalEditable, useLexicalNodeSelection } from '@hakulex/vue-lexical'

const props = defineProps<{ nodeKey: string }>()

const editable = useLexicalEditable()
const { isSelected, setSelected, clearSelection } = useLexicalNodeSelection(props.nodeKey)

// Click selects the rule (Backspace / Delete then remove it); Shift+click toggles it
// within a multi-node selection.
function onClick(event: MouseEvent) {
  if (!editable.value)
    return
  if (event.shiftKey) {
    setSelected(!isSelected.value)
    return
  }
  clearSelection()
  setSelected(true)
}
</script>

<template>
  <HorizontalRuleView :data-selected="isSelected || undefined" @click="onClick" />
</template>
