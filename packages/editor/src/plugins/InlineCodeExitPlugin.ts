import type { LexicalEditor } from 'lexical'
import { useLexicalRegister } from '@hakulex/vue-lexical'
import { mergeRegister } from '@lexical/utils'
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  IS_CODE,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_SPACE_COMMAND,
} from 'lexical'
import { defineComponent } from 'vue'

/** Turns code formatting off for the next typed text when the caret ends a line of inline code. */
function $exitInlineCode(editor: LexicalEditor): boolean {
  const selection = $getSelection()
  if (!editor.isEditable() || !$isRangeSelection(selection) || !selection.isCollapsed() || !selection.hasFormat('code'))
    return false
  const node = selection.anchor.getNode()
  if (!$isTextNode(node) || !node.hasFormat('code') || selection.anchor.offset !== node.getTextContentSize())
    return false
  if (node.getNextSibling() !== null || node.getParentOrThrow().isInline())
    return false
  selection.setFormat(node.getFormat() & ~IS_CODE)
  return true
}

/** At the end of a line there is nowhere after inline code for the caret to go. */
export const InlineCodeExitPlugin = defineComponent({
  name: 'InlineCodeExitPlugin',
  setup() {
    useLexicalRegister(editor => mergeRegister(
      editor.registerCommand(KEY_ARROW_RIGHT_COMMAND, (event) => {
        if (!$exitInlineCode(editor))
          return false
        event.preventDefault()
        return true
      }, COMMAND_PRIORITY_HIGH),
      // Let the space itself be typed, just without the code format.
      editor.registerCommand(KEY_SPACE_COMMAND, () => {
        $exitInlineCode(editor)
        return false
      }, COMMAND_PRIORITY_HIGH),
    ))
    return () => null
  },
})
