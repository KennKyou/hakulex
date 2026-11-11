import { useLexicalRegister } from '@hakulex/vue-lexical'
import { $dfs, $findMatchingParent, mergeRegister } from '@lexical/utils'
import {
  $addUpdateTag,
  $getSelection,
  $insertNodes,
  $isDecoratorNode,
  $isElementNode,
  $isRangeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  HISTORIC_TAG,
  HISTORY_MERGE_TAG,
  HISTORY_PUSH_TAG,
} from 'lexical'
import { defineComponent } from 'vue'
import {
  $footnoteState,
  $reconcileFootnotes,
  $scanFootnotes,
  $sectionBelongsLast,
  needsFootnoteReconcile,
  nextFootnoteIdentifier,
  sameFootnoteState,
} from '../footnote/document'
import { footnoteStore } from '../footnote/state'
import {
  $createFootnoteNode,
  FootnoteNode,
  FootnoteSectionNode,
  INSERT_FOOTNOTE_COMMAND,
} from '../nodes/FootnoteNodes'

/** Numbers footnotes, keeps their section in order, and inserts new ones. */
export const FootnotePlugin = defineComponent({
  name: 'FootnotePlugin',
  setup() {
    useLexicalRegister((editor) => {
      const store = footnoteStore(editor)
      // Documents without footnotes don't pay for a walk on every keystroke.
      const present = new Set<string>()
      const track = (mutations: Map<string, string>) => {
        for (const [key, mutation] of mutations) {
          if (mutation === 'destroyed')
            present.delete(key)
          else
            present.add(key)
        }
      }

      /** Publishes numbers and content. */
      const $refresh = () => {
        const scan = $scanFootnotes()
        const next = $footnoteState(scan)
        if (!sameFootnoteState(store.state.value, next))
          store.state.value = next
        return scan
      }

      // The document is already loaded by now, and stays untouched until someone edits it.
      editor.getEditorState().read($refresh)

      return mergeRegister(
        editor.registerMutationListener(FootnoteNode, track),
        editor.registerMutationListener(FootnoteSectionNode, track),
        editor.registerUpdateListener(({ tags, editorState, prevEditorState, dirtyElements, dirtyLeaves }) => {
          if (!present.size)
            return
          const belongsLast = editorState.read(() => {
            const scan = $refresh()
            return $sectionBelongsLast(scan, prevEditorState)
          })
          // An undo stays as it was, read-only documents are never rewritten, and a document
          // loaded or replaced (which is not in history either) stays as it is until someone edits it.
          if (tags.has(HISTORIC_TAG) || tags.has(HISTORY_MERGE_TAG) || !editor.isEditable() || (dirtyElements.size === 0 && dirtyLeaves.size === 0))
            return
          const needsFix = editorState.read(() => needsFootnoteReconcile($scanFootnotes(), belongsLast))
          if (!needsFix)
            return
          // Part of whatever caused it, so it takes no undo step of its own.
          editor.update(() => $reconcileFootnotes($scanFootnotes(), belongsLast), { tag: HISTORY_MERGE_TAG })
        }),
        // Browsers end a triple click at the first non-editable part of a line, such as a reference.
        editor.registerCommand(CLICK_COMMAND, (event) => {
          const selection = $getSelection()
          if (event.detail !== 3 || !editor.isEditable() || !$isRangeSelection(selection))
            return false
          const block = $findMatchingParent(selection.anchor.getNode(), node => $isElementNode(node) && !node.isInline())
          if (!$isElementNode(block) || !$dfs(block).some(({ node }) => $isDecoratorNode(node) && node.isInline()))
            return false
          block.select(0, block.getChildrenSize())
          return false
        }, COMMAND_PRIORITY_LOW),
        editor.registerCommand(INSERT_FOOTNOTE_COMMAND, () => {
          const selection = $getSelection()
          if (!editor.isEditable() || !$isRangeSelection(selection))
            return false
          const scan = $scanFootnotes()
          const identifier = nextFootnoteIdentifier($footnoteState(scan))
          const node = $createFootnoteNode(identifier)
          $addUpdateTag(HISTORY_PUSH_TAG)
          $insertNodes([node])
          node.selectNext(0, 0)
          store.focus.value = {
            identifier,
            refKey: node.getKey(),
          }
          return true
        }, COMMAND_PRIORITY_EDITOR),
      )
    })
    return () => null
  },
})
