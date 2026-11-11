import type { LexicalCommand, TextNode } from 'lexical'
import { useLexicalRegister } from '@hakulex/vue-lexical'
import { mergeRegister } from '@lexical/utils'
import { $addUpdateTag, $getSelection, $insertNodes, $isRangeSelection, COMMAND_PRIORITY_EDITOR, COMMAND_PRIORITY_LOW, CONTROLLED_TEXT_INSERTION_COMMAND, createCommand, HISTORY_PUSH_TAG, KEY_ARROW_RIGHT_COMMAND } from 'lexical'
import { defineComponent } from 'vue'
import { $createCommentNode, $isCommentNode } from '../nodes/CommentNode'
import { $createTagNode, $isTagNode, getTypedOver, setTypedOver } from '../nodes/TagNode'

export const INSERT_TAG_COMMAND: LexicalCommand<void> = createCommand('INSERT_TAG_COMMAND')
export const INSERT_COMMENT_COMMAND: LexicalCommand<void> = createCommand('INSERT_COMMENT_COMMAND')

/** Inserts `node` with its text selected, so typing replaces the default. */
function $insertSelected(node: TextNode): boolean {
  if (!$isRangeSelection($getSelection()))
    return false
  $addUpdateTag(HISTORY_PUSH_TAG)
  $insertNodes([node])
  node.select(0, node.getTextContentSize())
  return true
}

/** Inserts tags and HTML comments, and keeps typing over their selected text inside them. */
export const AnnotationPlugin = defineComponent({
  name: 'AnnotationPlugin',
  setup() {
    useLexicalRegister((editor) => {
      /**
       * Lexical would delete selected text first, then send what is typed outside as it
       * does at these nodes' edges, so the selected default text couldn't be typed over.
       * From here their end takes text until the caret leaves, or only the first
       * character of a word would land inside.
       */
      function $typeOver(text: string): boolean {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || selection.isCollapsed())
          return false
        const { anchor, focus } = selection
        const node = anchor.getNode()
        if (!node.is(focus.getNode()) || (!$isTagNode(node) && !$isCommentNode(node)))
          return false
        node.spliceText(Math.min(anchor.offset, focus.offset), Math.abs(anchor.offset - focus.offset), text, true)
        setTypedOver(editor, node.getKey())
        return true
      }

      function $isCaretAtTypedOverEnd() {
        const selection = $getSelection()
        return $isRangeSelection(selection)
          && selection.isCollapsed()
          && selection.anchor.key === getTypedOver(editor)
          && selection.anchor.offset === selection.anchor.getNode().getTextContentSize()
      }

      return mergeRegister(
        editor.registerCommand(INSERT_TAG_COMMAND, () => $insertSelected($createTagNode('標籤')), COMMAND_PRIORITY_EDITOR),
        editor.registerCommand(INSERT_COMMENT_COMMAND, () => $insertSelected($createCommentNode('註解')), COMMAND_PRIORITY_EDITOR),
        editor.registerCommand(CONTROLLED_TEXT_INSERTION_COMMAND, text => typeof text === 'string' && $typeOver(text), COMMAND_PRIORITY_LOW),
        // At the end of a line the caret has nowhere to go, but this is how to say you're done.
        editor.registerCommand(KEY_ARROW_RIGHT_COMMAND, () => {
          setTypedOver(editor, null)
          return false
        }, COMMAND_PRIORITY_LOW),
        editor.registerUpdateListener(({ editorState }) => {
          // Mid-composition the caret can be anywhere in what is being composed.
          if (getTypedOver(editor) && !editor.isComposing() && !editorState.read($isCaretAtTypedOverEnd))
            setTypedOver(editor, null)
        }),
        () => setTypedOver(editor, null),
      )
    })
    return () => null
  },
})
