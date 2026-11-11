import { useLexicalRegister } from '@hakulex/vue-lexical'
import { mergeRegister } from '@lexical/utils'
import { COMMAND_PRIORITY_LOW, KEY_ARROW_DOWN_COMMAND, KEY_ARROW_UP_COMMAND } from 'lexical'
import { defineComponent } from 'vue'
import { $moveAroundBlock } from '../media/block-navigation'
import { $isUnknownBlockNode } from '../nodes/UnknownNodes'

/** Lets the keyboard reach placeholders, which browsers skip like any non-editable block. */
export const UnknownNodePlugin = defineComponent({
  name: 'UnknownNodePlugin',
  setup() {
    useLexicalRegister(editor => mergeRegister(
      editor.registerCommand(KEY_ARROW_UP_COMMAND, event => $moveAroundBlock(editor, $isUnknownBlockNode, 'up', event), COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_ARROW_DOWN_COMMAND, event => $moveAroundBlock(editor, $isUnknownBlockNode, 'down', event), COMMAND_PRIORITY_LOW),
    ))
    return () => null
  },
})
