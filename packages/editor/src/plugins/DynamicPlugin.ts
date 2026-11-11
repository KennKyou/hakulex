import { useLexicalRegister } from '@hakulex/vue-lexical'
import { mergeRegister } from '@lexical/utils'
import {
  $addUpdateTag,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  HISTORY_PUSH_TAG,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
} from 'lexical'
import { defineComponent } from 'vue'
import { $moveAroundBlock, $selectedBlock, $selectNode } from '../media/block-navigation'
import { $insertBlock, $liftBlock } from '../media/insert'
import { blockPanelOf } from '../media/live-edit'
import { $createDynamicNode, $isDynamicNode, DynamicNode, INSERT_DYNAMIC_COMMAND } from '../nodes/DynamicNode'

/** Adds dynamic blocks, opens their panel on Enter, and takes the keyboard to and past them. */
export const DynamicPlugin = defineComponent({
  name: 'DynamicPlugin',
  setup() {
    useLexicalRegister(editor => mergeRegister(
      editor.registerNodeTransform(DynamicNode, $liftBlock),

      // A new one goes straight in, picked, with its panel open on the address.
      editor.registerCommand(INSERT_DYNAMIC_COMMAND, () => {
        if (!editor.isEditable())
          return false
        $addUpdateTag(HISTORY_PUSH_TAG)
        const node = $createDynamicNode()
        $insertBlock(node)
        $selectNode(node)
        blockPanelOf(editor).value = node.getKey()
        return true
      }, COMMAND_PRIORITY_EDITOR),

      editor.registerCommand(KEY_ENTER_COMMAND, (event) => {
        const node = $selectedBlock($isDynamicNode)
        if (!node || !editor.isEditable())
          return false
        event?.preventDefault()
        blockPanelOf(editor).value = node.getKey()
        return true
      }, COMMAND_PRIORITY_LOW),

      editor.registerCommand(KEY_ARROW_UP_COMMAND, event => $moveAroundBlock(editor, $isDynamicNode, 'up', event), COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_ARROW_DOWN_COMMAND, event => $moveAroundBlock(editor, $isDynamicNode, 'down', event), COMMAND_PRIORITY_LOW),
    ))
    return () => null
  },
})
