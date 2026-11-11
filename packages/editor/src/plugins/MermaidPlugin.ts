import { useLexicalRegister } from '@hakulex/vue-lexical'
import { $insertNodeToNearestRoot, mergeRegister } from '@lexical/utils'
import {
  $createParagraphNode,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_NORMAL,
  KEY_ENTER_COMMAND,
} from 'lexical'
import { defineComponent } from 'vue'
import { $replaceWithMermaid } from '../mermaid/insert'
import { INSERT_MERMAID_COMMAND } from '../nodes/MermaidNode'

/** Handles `INSERT_MERMAID_COMMAND` and "```mermaid" + Enter. Needs `MermaidNode`. */
export const MermaidPlugin = defineComponent({
  name: 'MermaidPlugin',
  setup() {
    useLexicalRegister(editor => mergeRegister(
      editor.registerCommand(INSERT_MERMAID_COMMAND, (diagram) => {
        const selection = $getSelection()
        const block = $isRangeSelection(selection)
          ? selection.anchor.getNode().getTopLevelElement()
          : null
        const blank = $isParagraphNode(block)
          && block.getChildren().every(child => $isTextNode(child) && child.getTextContentSize() === 0)
        if (blank) {
          $replaceWithMermaid(block, diagram ?? '')
          return true
        }
        const paragraph = $createParagraphNode()
        $insertNodeToNearestRoot(paragraph)
        $replaceWithMermaid(paragraph, diagram ?? '')
        return true
      }, COMMAND_PRIORITY_EDITOR),

      // Above CodeBlockPlugin's "```lang" + Enter, which would make a code block.
      editor.registerCommand(KEY_ENTER_COMMAND, (event) => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || !selection.isCollapsed() || event?.shiftKey)
          return false
        const block = selection.anchor.getNode().getTopLevelElement()
        if (!$isParagraphNode(block) || !/^[ \t]*`{3,}mermaid[ \t]*$/i.test(block.getTextContent()))
          return false
        event?.preventDefault()
        $replaceWithMermaid(block, '')
        return true
      }, COMMAND_PRIORITY_NORMAL),
    ))
    return () => null
  },
})
