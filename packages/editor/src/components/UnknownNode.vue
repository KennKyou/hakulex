<script setup lang="ts">
import { useLexicalEditable, useLexicalNodeSelection } from '@hakulex/vue-lexical'
import { computed } from 'vue'

const props = defineProps<{
  nodeKey: string
  type: string
  inline: boolean
  text?: string
}>()

const editable = useLexicalEditable()
const { isSelected, setSelected, clearSelection } = useLexicalNodeSelection(props.nodeKey)
const selected = computed(() => editable.value && isSelected.value)

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
  <span
    v-if="inline"
    class="hlx-unknown hlx-unknown--inline"
    :data-unknown-type="type"
    :data-selected="selected || undefined"
    :title="`尚未支援的內容：${type}`"
    @click="onClick"
  >{{ text || type }}</span>
  <div
    v-else
    class="hlx-unknown"
    :data-unknown-type="type"
    :data-selected="selected || undefined"
    :title="type"
    @click="onClick"
  >
    <span class="hlx-unknown-label">尚未支援的內容，已保留</span>
    <code class="hlx-unknown-type">{{ type }}</code>
  </div>
</template>
