import type { LexicalEditor, LexicalNode } from 'lexical'
import type { PropType } from 'vue'
import type { NestedContent } from './content'
import { ContentEditable, LexicalNestedComposer, useLexicalComposer, useLexicalRegister } from '@hakulex/vue-lexical'
import { mergeRegister } from '@lexical/utils'
import {
  $addUpdateTag,
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isDecoratorNode,
  $isElementNode,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  HISTORY_MERGE_TAG,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ESCAPE_COMMAND,
  SKIP_DOM_SELECTION_TAG,
} from 'lexical'
import { defineComponent, h, inject } from 'vue'
import { EditorCoreKey, EditorCorePlugins } from '../EditorCorePlugins'
import { $selectNode, isCaretOnEdgeLine } from '../media/block-navigation'
import { nestedNodes, NestedSyncPlugin } from './content'

export type Direction = 'up' | 'down'

/** Goes from a block to what is above or below it, making a line if nothing can take the caret. */
export function $leaveBlock(node: LexicalNode, direction: Direction) {
  const backward = direction === 'up'
  let neighbor = backward
    ? node.getPreviousSibling()
    : node.getNextSibling()
  if ($isDecoratorNode(neighbor) && neighbor.isKeyboardSelectable()) {
    $selectNode(neighbor)
    return
  }
  if (!$isElementNode(neighbor)) {
    neighbor = $createParagraphNode()
    if (backward)
      node.insertBefore(neighbor)
    else
      node.insertAfter(neighbor)
  }
  if (backward)
    neighbor.selectEnd()
  else
    neighbor.selectStart()
}

/**
 * Going from the outer editor into a nested one. Plugins can update the outer editor on any press,
 * and that update reads a selection from what the DOM still has: it would pull focus back out.
 */
export function releaseOuterSelection(outer: LexicalEditor) {
  document.getSelection()?.removeAllRanges()
  if (outer.getEditorState()._selection) {
    outer.update(() => {
      $addUpdateTag(SKIP_DOM_SELECTION_TAG)
      $addUpdateTag(HISTORY_MERGE_TAG)
      $setSelection(null)
    }, { discrete: true })
  }
}

export function focusNested(editor: LexicalEditor | undefined, where: 'start' | 'end') {
  if (!editor)
    return
  editor.update(() => {
    if (where === 'start')
      $getRoot().selectStart()
    else
      $getRoot().selectEnd()
  })
  editor.getRootElement()?.focus({ preventScroll: true })
}

/** The keyboard inside a nested editor, for what goes beyond it. */
export const NestedKeysPlugin = defineComponent({
  name: 'NestedKeysPlugin',
  props: {
    onExit: { type: Function as PropType<(direction: Direction) => void>, required: true },
    onEscape: { type: Function as PropType<() => void>, required: true },
  },
  setup(props) {
    useLexicalRegister((editor) => {
      const edge = (direction: Direction) => (event: KeyboardEvent | null) => {
        const backward = direction === 'up'
        const selection = $getSelection()
        if (event?.shiftKey || !$isRangeSelection(selection) || !selection.isCollapsed())
          return false
        const block = selection.anchor.getNode().getTopLevelElement()
        const neighbor = backward
          ? block?.getPreviousSibling()
          : block?.getNextSibling()
        if (!block || neighbor || !isCaretOnEdgeLine(editor, block, backward ? 'first' : 'last'))
          return false
        event?.preventDefault()
        props.onExit(direction)
        return true
      }
      return mergeRegister(
        editor.registerCommand(KEY_ARROW_UP_COMMAND, edge('up'), COMMAND_PRIORITY_LOW),
        editor.registerCommand(KEY_ARROW_DOWN_COMMAND, edge('down'), COMMAND_PRIORITY_LOW),
        // Low, so that menus and the like get to close first.
        editor.registerCommand(KEY_ESCAPE_COMMAND, (event) => {
          event?.preventDefault()
          props.onEscape()
          return true
        }, COMMAND_PRIORITY_LOW),
      )
    })
    return () => null
  },
})

/** A nested editor on the page, with everything an editing surface has. */
export const NestedEditorArea = defineComponent({
  name: 'NestedEditorArea',
  props: {
    content: { type: Object as PropType<NestedContent>, required: true },
    onExit: { type: Function as PropType<(direction: Direction) => void>, required: true },
    onEscape: { type: Function as PropType<() => void>, required: true },
  },
  setup(props) {
    const outer = useLexicalComposer()
    const core = inject(EditorCoreKey)!
    const nodes = nestedNodes(outer)
    return () => h(LexicalNestedComposer, { editor: props.content.editor }, () => [
      h(ContentEditable, { class: 'hlx-content' }),
      h(EditorCorePlugins, { nodes, nested: true }),
      h(NestedSyncPlugin, { baseline: props.content.baseline }),
      h(NestedKeysPlugin, { onExit: props.onExit, onEscape: props.onEscape }),
      core.nested(),
    ])
  },
})
