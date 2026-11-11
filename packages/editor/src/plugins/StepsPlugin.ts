import { useLexicalRegister } from '@hakulex/vue-lexical'
import { mergeRegister } from '@lexical/utils'
import {
  $addUpdateTag,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  HISTORY_PUSH_TAG,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
} from 'lexical'
import { defineComponent } from 'vue'
import { $moveAroundBlock, $selectedBlock, isCaretOnEdgeLine } from '../media/block-navigation'
import { $insertBlock, $liftBlock } from '../media/insert'
import { $createStepsNode, $isStepsNode, INSERT_STEPS_COMMAND, stepsFocusChannel, StepsNode } from '../nodes/StepsNode'

/** Inserts steps and takes the outer editor's keyboard into and out of them. */
export const StepsPlugin = defineComponent({
  name: 'StepsPlugin',
  setup() {
    useLexicalRegister((editor) => {
      const enterFromOutside = (direction: 'up' | 'down') => (event: KeyboardEvent | null) => {
        const backward = direction === 'up'
        if ($selectedBlock($isStepsNode))
          return $moveAroundBlock(editor, $isStepsNode, direction, event)
        const selection = $getSelection()
        if (event?.shiftKey || !$isRangeSelection(selection) || !selection.isCollapsed())
          return false
        const block = selection.anchor.getNode().getTopLevelElement()
        const neighbor = backward
          ? block?.getPreviousSibling()
          : block?.getNextSibling()
        if (!block || !$isStepsNode(neighbor) || !isCaretOnEdgeLine(editor, block, backward ? 'first' : 'last'))
          return false
        event?.preventDefault()
        stepsFocusChannel.request(editor, neighbor.getKey(), backward ? 'last-content' : 'first-title')
        return true
      }
      return mergeRegister(
        editor.registerNodeTransform(StepsNode, $liftBlock),
        editor.registerCommand(INSERT_STEPS_COMMAND, () => {
          $addUpdateTag(HISTORY_PUSH_TAG)
          const node = $createStepsNode()
          $insertBlock(node)
          stepsFocusChannel.request(editor, node.getKey(), 'first-title')
          return true
        }, COMMAND_PRIORITY_EDITOR),
        editor.registerCommand(KEY_ENTER_COMMAND, (event) => {
          const node = $selectedBlock($isStepsNode)
          if (!node)
            return false
          event?.preventDefault()
          stepsFocusChannel.request(editor, node.getKey(), 'first-title')
          return true
        }, COMMAND_PRIORITY_LOW),
        editor.registerCommand(KEY_ARROW_UP_COMMAND, enterFromOutside('up'), COMMAND_PRIORITY_LOW),
        editor.registerCommand(KEY_ARROW_DOWN_COMMAND, enterFromOutside('down'), COMMAND_PRIORITY_LOW),
      )
    })
    return () => null
  },
})
