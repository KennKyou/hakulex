import { useLexicalRegister } from '@hakulex/vue-lexical'
import { $insertNodeToNearestRoot } from '@lexical/utils'
import {
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_EDITOR,
} from 'lexical'
import { defineComponent } from 'vue'
import { $createHorizontalRuleNode, INSERT_HORIZONTAL_RULE_COMMAND } from '../nodes/HorizontalRuleNode'

/** Handles `INSERT_HORIZONTAL_RULE_COMMAND`. Needs `HorizontalRuleNode`. */
export const HorizontalRulePlugin = defineComponent({
  name: 'HorizontalRulePlugin',
  setup() {
    useLexicalRegister(editor => editor.registerCommand(INSERT_HORIZONTAL_RULE_COMMAND, () => {
      const rule = $createHorizontalRuleNode()
      const selection = $getSelection()
      const block = $isRangeSelection(selection) && selection.isCollapsed()
        ? selection.anchor.getNode().getTopLevelElement()
        : null

      // On an empty line the rule takes the line's place; the empty paragraph
      // moves below it and keeps the caret. "Empty" includes leftover empty text
      // nodes (e.g. after the slash menu removed `/hr`), which Lexical only
      // normalizes away at the end of the update.
      const isBlank = $isParagraphNode(block)
        && block.getChildren().every(child => $isTextNode(child) && child.getTextContentSize() === 0)
      if (isBlank) {
        block.insertBefore(rule)
        return true
      }
      // Otherwise split the block at the caret; a paragraph is kept after the rule.
      $insertNodeToNearestRoot(rule)
      return true
    }, COMMAND_PRIORITY_EDITOR))
    return () => null
  },
})
