<script setup lang="ts">
import type { SlashMenuItem } from '@hakulex/plugin-slash-menu'
import { useLexicalComposer } from '@hakulex/vue-lexical'
import { $getRoot, $getSelection, $isRangeSelection } from 'lexical'
import { onMounted } from 'vue'

/*
 * Starts the real editor where the preview left off: with the item the visitor picked put in,
 * or with a `/` typed so the real menu opens. It runs once the visitor has clicked, so taking
 * the focus is expected.
 */
const props = defineProps<{ item?: SlashMenuItem }>()
const editor = useLexicalComposer()

onMounted(() => {
  editor.focus(() => {
    editor.update(() => {
      $getRoot().selectEnd()
      if (props.item) {
        props.item.run(editor)
        return
      }
      const selection = $getSelection()
      if ($isRangeSelection(selection))
        selection.insertText('/')
    })
  })
})
</script>

<template>
  <slot />
</template>
