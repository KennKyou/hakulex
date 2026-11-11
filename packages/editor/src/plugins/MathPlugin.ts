import { useLexicalRegister } from '@hakulex/vue-lexical'
import { $insertNodeToNearestRoot, mergeRegister } from '@lexical/utils'
import {
  $createParagraphNode,
  $getSelection,
  $insertNodes,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  KEY_ENTER_COMMAND,
} from 'lexical'
import { defineComponent } from 'vue'
import { mathEditChannel } from '../math/edit'
import { $replaceWithMathBlock } from '../math/insert'
import { $createKaTeXInlineNode, INSERT_MATH_COMMAND } from '../nodes/MathNodes'

/** Handles `INSERT_MATH_COMMAND` and "$$" + Enter. Needs the KaTeX nodes. */
export const MathPlugin = defineComponent({
  name: 'MathPlugin',
  setup() {
    useLexicalRegister(editor => mergeRegister(
      editor.registerCommand(INSERT_MATH_COMMAND, ({ display, equation = '' }) => {
        const selection = $getSelection()
        if (!display) {
          const node = $createKaTeXInlineNode(equation)
          $insertNodes([node])
          if (!equation)
            mathEditChannel.request(editor, node.getKey(), undefined)
          return true
        }

        const block = $isRangeSelection(selection)
          ? selection.anchor.getNode().getTopLevelElement()
          : null
        const blank = $isParagraphNode(block)
          && block.getChildren().every(child => $isTextNode(child) && child.getTextContentSize() === 0)
        if (blank) {
          $replaceWithMathBlock(block, equation)
          return true
        }
        const paragraph = $createParagraphNode()
        $insertNodeToNearestRoot(paragraph)
        $replaceWithMathBlock(paragraph, equation)
        return true
      }, COMMAND_PRIORITY_EDITOR),

      // "$$" + Enter starts a block equation.
      editor.registerCommand(KEY_ENTER_COMMAND, (event) => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || !selection.isCollapsed() || event?.shiftKey)
          return false
        const block = selection.anchor.getNode().getTopLevelElement()
        if (!$isParagraphNode(block) || block.getTextContent().trim() !== '$$')
          return false
        event?.preventDefault()
        $replaceWithMathBlock(block, '')
        return true
      }, COMMAND_PRIORITY_LOW),
    ))
    return () => null
  },
})
