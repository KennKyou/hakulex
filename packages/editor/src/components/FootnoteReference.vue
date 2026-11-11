<script setup lang="ts">
import { renderFootnoteRef } from '@hakulex/renderer'
import { useLexicalComposer, useLexicalEditable } from '@hakulex/vue-lexical'
import { footnoteStore } from '../footnote/state'

const props = defineProps<{ nodeKey: string, identifier: string }>()

const editor = useLexicalComposer()
const editable = useLexicalEditable()
const { state, focus } = footnoteStore(editor)

// Reads the state as it renders, so a change patches the DOM instead of replacing it.
function Reference() {
  const { numbers, definitions, firstKeys } = state.value
  // Invalid identifiers have nowhere to go, and no number to show.
  if (!props.identifier)
    return null
  const content = definitions.get(props.identifier)
  return renderFootnoteRef({
    identifier: props.identifier,
    number: numbers.get(props.identifier),
    content: content?.trim()
      ? content
      : undefined,
    // While editing, clicks are handled here, and the page may show a preview with the same ids.
    first: !editable.value && firstKeys.get(props.identifier) === props.nodeKey,
  })
}

/** While editing, the place to go is the note's input. Readers follow the link. */
function onClick(event: MouseEvent) {
  if (!editable.value || !props.identifier)
    return
  event.preventDefault()
  focus.value = { identifier: props.identifier, refKey: props.nodeKey }
}
</script>

<template>
  <span class="hlx-footnote-click" @click="onClick"><Reference /></span>
</template>
