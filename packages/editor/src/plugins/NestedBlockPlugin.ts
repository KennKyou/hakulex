import type { LexicalEditor, LexicalNode, NodeKey } from 'lexical'
import { useLexicalComposer, useLexicalEditable, useLexicalNodeSelection, useLexicalRegister } from '@hakulex/vue-lexical'
import { mergeRegister } from '@lexical/utils'
import {
  $addUpdateTag,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  HISTORY_PUSH_TAG,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
} from 'lexical'
import { computed, defineComponent } from 'vue'
import { createDecoratorChannel } from '../decorator-channel'
import { $moveAroundBlock, $selectedBlock, $selectNode, isCaretOnEdgeLine } from '../media/block-navigation'
import { $insertBlock, $liftBlock } from '../media/insert'
import { $leaveBlock, releaseOuterSelection } from '../nested/keys'
import { $createGridNode, $isGridNode, GridNode, INSERT_GRID_COMMAND } from '../nodes/GridNode'
import { $createNestedDocNode, $isNestedDocNode, INSERT_NESTED_DOC_COMMAND, NestedDocNode } from '../nodes/NestedDocNode'

/** Asks a block's component to move focus into it, from above or from below. */
export const nestedFocusChannel = createDecoratorChannel<'first' | 'last'>()

const $isNestedBlock = (node: LexicalNode): node is NestedDocNode | GridNode => $isNestedDocNode(node) || $isGridNode(node)

/** Inserts these blocks and takes the outer editor's keyboard into and out of them. */
export const NestedBlockPlugin = defineComponent({
  name: 'NestedBlockPlugin',
  setup() {
    useLexicalRegister((editor) => {
      const enterFromOutside = (direction: 'up' | 'down') => (event: KeyboardEvent | null) => {
        const backward = direction === 'up'
        if ($selectedBlock($isNestedBlock))
          return $moveAroundBlock(editor, $isNestedBlock, direction, event)
        const selection = $getSelection()
        if (event?.shiftKey || !$isRangeSelection(selection) || !selection.isCollapsed())
          return false
        const block = selection.anchor.getNode().getTopLevelElement()
        const neighbor = backward
          ? block?.getPreviousSibling()
          : block?.getNextSibling()
        if (!block || !neighbor || !$isNestedBlock(neighbor) || !isCaretOnEdgeLine(editor, block, backward ? 'first' : 'last'))
          return false
        event?.preventDefault()
        nestedFocusChannel.request(editor, neighbor.getKey(), backward ? 'last' : 'first')
        return true
      }
      return mergeRegister(
        editor.registerNodeTransform(NestedDocNode, $liftBlock),
        editor.registerNodeTransform(GridNode, $liftBlock),
        editor.registerCommand(INSERT_GRID_COMMAND, () => {
          $addUpdateTag(HISTORY_PUSH_TAG)
          const node = $createGridNode()
          $insertBlock(node)
          nestedFocusChannel.request(editor, node.getKey(), 'first')
          return true
        }, COMMAND_PRIORITY_EDITOR),
        editor.registerCommand(INSERT_NESTED_DOC_COMMAND, () => {
          $addUpdateTag(HISTORY_PUSH_TAG)
          const node = $createNestedDocNode()
          $insertBlock(node)
          nestedFocusChannel.request(editor, node.getKey(), 'first')
          return true
        }, COMMAND_PRIORITY_EDITOR),
        editor.registerCommand(KEY_ENTER_COMMAND, (event) => {
          const node = $selectedBlock($isNestedBlock)
          if (!node)
            return false
          event?.preventDefault()
          nestedFocusChannel.request(editor, node.getKey(), 'first')
          return true
        }, COMMAND_PRIORITY_LOW),
        editor.registerCommand(KEY_ARROW_UP_COMMAND, enterFromOutside('up'), COMMAND_PRIORITY_LOW),
        editor.registerCommand(KEY_ARROW_DOWN_COMMAND, enterFromOutside('down'), COMMAND_PRIORITY_LOW),
      )
    })
    return () => null
  },
})

/** What a block of editors does on the page: picking it, leaving it, and letting the caret into it. */
export function useNestedBlock(nodeKey: NodeKey) {
  const outer: LexicalEditor = useLexicalComposer()
  const editable = useLexicalEditable()
  const { isSelected, setSelected, clearSelection } = useLexicalNodeSelection(nodeKey)
  return {
    outer,
    editable,
    selected: computed(() => editable.value && isSelected.value),
    leave(direction: 'up' | 'down') {
      outer.getRootElement()?.focus({ preventScroll: true })
      outer.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (node)
          $leaveBlock(node, direction)
      })
    },
    selectBlock() {
      outer.getRootElement()?.focus({ preventScroll: true })
      outer.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (node)
          $selectNode(node)
      })
    },
    onPointerDown(event: PointerEvent) {
      if (event.button === 0 && (event.target as Element).closest('[data-lexical-editor]') !== outer.getRootElement())
        releaseOuterSelection(outer)
    },
    onClick(event: MouseEvent) {
      // Only the parts that aren't for editing pick the whole block.
      if (!editable.value || (event.target as Element).closest('button') || (event.target as Element).closest('[data-lexical-editor]') !== outer.getRootElement())
        return
      clearSelection()
      setSelected(true)
    },
  }
}
