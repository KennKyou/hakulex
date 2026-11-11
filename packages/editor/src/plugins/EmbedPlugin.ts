import { parseEmbedUrl } from '@hakulex/renderer'
import { useLexicalRegister } from '@hakulex/vue-lexical'
import { mergeRegister } from '@lexical/utils'
import {
  $addUpdateTag,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isRootNode,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  HISTORY_PUSH_TAG,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  PASTE_COMMAND,
} from 'lexical'
import { defineComponent } from 'vue'
import { $moveAroundBlock, $selectedBlock } from '../media/block-navigation'
import { $insertBlock, $liftBlock } from '../media/insert'
import { $createEmbedNode, $isEmbedNode, embedFocusChannel, EmbedNode, INSERT_EMBED_COMMAND } from '../nodes/EmbedNode'

/** A blank line at the top level: the only place pasting a URL may make a block. */
function $isCaretOnBlankLine(): boolean {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed())
    return false
  const node = selection.anchor.getNode()
  const paragraph = $isParagraphNode(node)
    ? node
    : node.getParent()
  return $isParagraphNode(paragraph) && $isRootNode(paragraph.getParent()) && paragraph.getTextContentSize() === 0
}

/** Handles the embed commands, keyboard navigation and pasted URLs. */
export const EmbedPlugin = defineComponent({
  name: 'EmbedPlugin',
  setup() {
    useLexicalRegister(editor => mergeRegister(
      editor.registerNodeTransform(EmbedNode, $liftBlock),

      editor.registerCommand(INSERT_EMBED_COMMAND, () => {
        $addUpdateTag(HISTORY_PUSH_TAG)
        const node = $createEmbedNode()
        $insertBlock(node)
        embedFocusChannel.request(editor, node.getKey(), undefined)
        return true
      }, COMMAND_PRIORITY_EDITOR),

      // Before Markdown paste and auto links, which would make this a link.
      editor.registerCommand(PASTE_COMMAND, (event) => {
        const clipboard = 'clipboardData' in event
          ? event.clipboardData
          : null
        const url = clipboard?.getData('text/plain').trim()
        if (!url || /\s/.test(url) || !parseEmbedUrl(url) || !$isCaretOnBlankLine())
          return false
        event.preventDefault()
        $addUpdateTag(HISTORY_PUSH_TAG)
        $insertBlock($createEmbedNode(url))
        return true
      }, COMMAND_PRIORITY_CRITICAL),

      editor.registerCommand(KEY_ENTER_COMMAND, (event) => {
        const node = $selectedBlock($isEmbedNode)
        if (!node)
          return false
        event?.preventDefault()
        embedFocusChannel.request(editor, node.getKey(), undefined)
        return true
      }, COMMAND_PRIORITY_LOW),

      editor.registerCommand(KEY_ARROW_UP_COMMAND, event => $moveAroundBlock(editor, $isEmbedNode, 'up', event), COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_ARROW_DOWN_COMMAND, event => $moveAroundBlock(editor, $isEmbedNode, 'down', event), COMMAND_PRIORITY_LOW),
    ))
    return () => null
  },
})
