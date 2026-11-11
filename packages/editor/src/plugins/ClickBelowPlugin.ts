import { useLexicalRegister } from '@hakulex/vue-lexical'
import { $isTableNode } from '@lexical/table'
import {
  $createParagraphNode,
  $getRoot,
  $isDecoratorNode,
  $isParagraphNode,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
} from 'lexical'
import { defineComponent } from 'vue'
import { $isCalloutNode } from '../nodes/CalloutNodes'
import { $isFootnoteSectionNode } from '../nodes/FootnoteNodes'

/** A trailing decorator, table or callout block has no line to put the caret on, so clicking below it adds one. */
export const ClickBelowPlugin = defineComponent({
  name: 'ClickBelowPlugin',
  setup() {
    useLexicalRegister(editor => editor.registerCommand(CLICK_COMMAND, (event) => {
      if (!editor.isEditable() || event.target !== editor.getRootElement())
        return false
      const last = $getRoot().getLastChild()
      if (!$isDecoratorNode(last) && !$isTableNode(last) && !$isCalloutNode(last))
        return false
      const bottom = editor.getElementByKey(last.getKey())?.getBoundingClientRect().bottom
      if (bottom !== undefined && event.clientY <= bottom)
        return false
      // Footnotes stay last, so the new line goes above them. An empty one is already there.
      if ($isFootnoteSectionNode(last)) {
        const previous = last.getPreviousSibling()
        if ($isParagraphNode(previous) && previous.isEmpty()) {
          previous.selectStart()
        }
        else {
          const line = $createParagraphNode()
          last.insertBefore(line)
          line.selectStart()
        }
        return true
      }
      const paragraph = $createParagraphNode()
      last.insertAfter(paragraph)
      paragraph.selectStart()
      return true
    }, COMMAND_PRIORITY_LOW))
    return () => null
  },
})
