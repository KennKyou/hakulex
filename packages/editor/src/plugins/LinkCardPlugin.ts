import { LinkCardSettingsKey, matchLinkCard } from '@hakulex/renderer'
import { useLexicalRegister } from '@hakulex/vue-lexical'
import {
  $addUpdateTag,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isRootNode,
  COMMAND_PRIORITY_HIGH,
  HISTORY_PUSH_TAG,
  PASTE_COMMAND,
} from 'lexical'
import { defineComponent, inject } from 'vue'
import { $insertBlock } from '../media/insert'
import { $createLinkCardNode } from '../nodes/LinkCardNode'

/** A blank line at the top level of this editor: the only place a pasted address makes a card. */
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

/**
 * An address a link card source knows, pasted on a blank line, becomes a card holding only the
 * address. After embeds, which take the addresses they know.
 */
export const LinkCardPlugin = defineComponent({
  name: 'LinkCardPlugin',
  setup() {
    const settings = inject(LinkCardSettingsKey, () => undefined)
    useLexicalRegister(editor => editor.registerCommand(PASTE_COMMAND, (event) => {
      const clipboard = 'clipboardData' in event
        ? event.clipboardData
        : null
      const url = clipboard?.getData('text/plain').trim()
      const current = settings()
      if (!url || /\s/.test(url) || current?.enabled === false || !matchLinkCard(url, current?.providers) || !$isCaretOnBlankLine())
        return false
      event.preventDefault()
      $addUpdateTag(HISTORY_PUSH_TAG)
      $insertBlock($createLinkCardNode({ url }))
      return true
    }, COMMAND_PRIORITY_HIGH))
    return () => null
  },
})
