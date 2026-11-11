<script setup lang="ts">
import { $prepareStoredNodes } from '@hakulex/editor'
import { useLexicalRegister } from '@hakulex/vue-lexical'
import {
  $addUpdateTag,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  $parseSerializedNode,
  COMMAND_PRIORITY_CRITICAL,
  HISTORY_PUSH_TAG,
  PASTE_COMMAND,
} from 'lexical'
import { parseLiteXmlSerializedNodes } from './detect'

/*
 * Pasted LiteXML becomes the blocks it describes: only
 * plain text with one of LiteXML's own tags, and not Lexical's own content or image files.
 * Ahead of Markdown paste, so Markdown inside a code block stays code. When reading it fails,
 * the other handlers paste the text as it is.
 */
useLexicalRegister(editor => editor.registerCommand(PASTE_COMMAND, (event) => {
  const clipboard = 'clipboardData' in event
    ? event.clipboardData
    : null
  if (!clipboard || !$isRangeSelection($getSelection()))
    return false
  if (clipboard.getData('application/x-lexical-editor')
    || [...clipboard.files].some(file => file.type.startsWith('image/'))) {
    return false
  }
  const text = clipboard.getData('text/plain')
  if (!text)
    return false
  try {
    const stored = parseLiteXmlSerializedNodes(text)
    if (!stored)
      return false
    const nodes = $prepareStoredNodes(stored).map(node => $parseSerializedNode(node))
    event.preventDefault()
    // Otherwise it merges with text typed just before, and undo takes both.
    $addUpdateTag(HISTORY_PUSH_TAG)
    $insertNodes(nodes)
    return true
  }
  catch (error) {
    console.error('[hakulex litexml] could not paste LiteXML', error)
    return false
  }
}, COMMAND_PRIORITY_CRITICAL))
</script>

<template>
  <slot />
</template>
