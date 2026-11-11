import type { ElementNode, LexicalNode, NodeKey } from 'lexical'
import type { CalloutState } from '../components/CalloutBar.vue'
import { useLexicalComposer, useLexicalEditable, useLexicalRegister } from '@hakulex/vue-lexical'
import { $findMatchingParent, $insertNodeToNearestRoot, mergeRegister } from '@lexical/utils'
import {
  $addUpdateTag,
  $createParagraphNode,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  HISTORY_MERGE_TAG,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_ENTER_COMMAND,
} from 'lexical'
import { computed, defineComponent, h, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { isCaretOnEdgeLine } from '../callout/caret'
import CalloutBar from '../components/CalloutBar.vue'
import {
  $createAlertNode,
  $createBannerNode,
  $createDetailsNode,
  $isCalloutNode,
  $isDetailsNode,
  AlertNode,
  BannerNode,
  DetailsNode,
  INSERT_CALLOUT_COMMAND,
} from '../nodes/CalloutNodes'

const DEFAULT_SUMMARY = '詳細內容'

const $calloutOf = (node: LexicalNode) => $findMatchingParent(node, $isCalloutNode)

/** The paragraph a collapsed caret is in, when it is directly inside a block. */
function $caretBlock() {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed())
    return null
  const anchor = selection.anchor.getNode()
  const block = $findMatchingParent(anchor, node => $isElementNode(node) && !node.isInline())
  const callout = block?.getParent()
  return block && $isCalloutNode(callout)
    ? { block: block as ElementNode, callout }
    : null
}

const $isBlank = (node: ElementNode) => $isParagraphNode(node) && node.isEmpty()

/** Moves the caret out of a block whose content can't be seen, so typing stays visible. */
function $moveCaretAfter(details: DetailsNode) {
  const next = details.getNextSibling()
  if ($isElementNode(next)) {
    next.selectStart()
    return
  }
  const paragraph = $createParagraphNode()
  details.insertAfter(paragraph)
  paragraph.selectStart()
}

/** A block must always have block-level children to put the caret in. */
function $normalizeCallout(node: AlertNode | BannerNode | DetailsNode) {
  let run: ReturnType<typeof $createParagraphNode> | null = null
  for (const child of node.getChildren()) {
    if (child.isInline()) {
      if (!run) {
        run = $createParagraphNode()
        child.insertBefore(run)
      }
      run.append(child)
    }
    else {
      run = null
    }
  }
  if (node.isEmpty())
    node.append($createParagraphNode())
}

function $insertCallout(node: ElementNode) {
  const inner = $createParagraphNode()
  node.append(inner)
  const selection = $getSelection()
  const anchor = $isRangeSelection(selection)
    ? selection.anchor.getNode()
    : null
  const block = anchor && $findMatchingParent(anchor, candidate => $isElementNode(candidate) && !candidate.isInline())
  if (block && $isParagraphNode(block) && block.getTextContentSize() === 0)
    block.replace(node)
  else
    $insertNodeToNearestRoot(node)
  inner.selectStart()
}

/** Blocks, their keyboard behavior, and the toolbar shown while the caret is inside one. */
export const CalloutPlugin = defineComponent({
  name: 'CalloutPlugin',
  setup() {
    const editor = useLexicalComposer()
    const editable = useLexicalEditable()
    const state = shallowRef<CalloutState | null>(null)
    const focused = shallowRef(false)
    const visible = computed(() => editable.value && focused.value
      ? state.value
      : null)

    /** A selection outlives focus, so it alone would leave the toolbar behind on other pages. */
    function readFocus(event?: FocusEvent) {
      // During focusout the active element is still <body>, whatever is about to take focus.
      // Removing the toolbar then would take it away from under the press that focuses it.
      const next = event?.type === 'focusout'
        ? event.relatedTarget as Element | null
        : null
      const active = next ?? document.activeElement
      focused.value = !!active && (
        !!editor.getRootElement()?.contains(active) || !!active.closest('.hlx-callout-bar')
      )
    }
    onMounted(() => {
      readFocus()
      document.addEventListener('focusin', readFocus)
      document.addEventListener('focusout', readFocus)
    })
    onBeforeUnmount(() => {
      document.removeEventListener('focusin', readFocus)
      document.removeEventListener('focusout', readFocus)
    })

    function readState(): CalloutState | null {
      const selection = $getSelection()
      if (!$isRangeSelection(selection) || !selection.isCollapsed())
        return null
      const callout = $calloutOf(selection.anchor.getNode())
      if (!callout)
        return null
      const key: NodeKey = callout.getKey()
      return $isDetailsNode(callout)
        ? {
            key,
            kind: 'details',
            summary: callout.getSummary(),
          }
        : {
            key,
            kind: callout instanceof AlertNode
              ? 'alert'
              : 'banner',
            type: callout.getCalloutType(),
          }
    }

    useLexicalRegister((lexical) => {
      const moveAround = (direction: 'up' | 'down') => {
        const found = $caretBlock()
        if (!found)
          return false
        const { block, callout } = found
        const backward = direction === 'up'
        const atEdge = backward
          ? block.is(callout.getFirstChild())
          : block.is(callout.getLastChild())
        if (!atEdge || !isCaretOnEdgeLine(lexical, block, backward ? 'first' : 'last'))
          return false
        const neighbor = backward
          ? callout.getPreviousSibling()
          : callout.getNextSibling()
        // The browser skips a collapsed block by itself.
        if ($isDetailsNode(neighbor) && !neighbor.getOpen())
          return false
        if ($isElementNode(neighbor)) {
          if (backward)
            neighbor.selectEnd()
          else
            neighbor.selectStart()
          return true
        }
        // Images and the like have their own arrow key handling.
        if (neighbor)
          return false
        const paragraph = $createParagraphNode()
        if (backward)
          callout.insertBefore(paragraph)
        else
          callout.insertAfter(paragraph)
        paragraph.selectStart()
        return true
      }

      /** Keeps the caret where it is: the browser would otherwise move it before the click. */
      const onRootMouseDown = (event: MouseEvent) => {
        if (lexical.isEditable() && (event.target as HTMLElement).closest?.('.hlx-details-summary'))
          event.preventDefault()
      }

      /** In the editor a click changes the document; read-only, the browser just toggles the view. */
      const onRootClick = (event: MouseEvent) => {
        const summary = (event.target as HTMLElement).closest?.('.hlx-details-summary')
        if (!summary || !lexical.isEditable())
          return
        event.preventDefault()
        lexical.update(() => {
          const node = $getNearestNodeFromDOMNode(summary.parentElement!)
          if (!$isDetailsNode(node))
            return
          const closing = node.getOpen()
          node.setOpen(!closing)
          const selection = $getSelection()
          if (!closing || !$isRangeSelection(selection) || !$findMatchingParent(selection.anchor.getNode(), candidate => node.is(candidate)))
            return
          $moveCaretAfter(node)
        })
      }

      return mergeRegister(
        lexical.registerRootListener((root, previous) => {
          previous?.removeEventListener('mousedown', onRootMouseDown)
          previous?.removeEventListener('click', onRootClick)
          root?.addEventListener('mousedown', onRootMouseDown)
          root?.addEventListener('click', onRootClick)
        }),
        lexical.registerNodeTransform(AlertNode, $normalizeCallout),
        lexical.registerNodeTransform(BannerNode, $normalizeCallout),
        lexical.registerNodeTransform(DetailsNode, $normalizeCallout),

        lexical.registerUpdateListener(({ editorState }) => {
          state.value = editorState.read(readState)
          // Pasting can end inside a block that markdown always imports collapsed.
          const hiddenIn = editorState.read(() => {
            const selection = $getSelection()
            if (!$isRangeSelection(selection))
              return null
            return $findMatchingParent(selection.anchor.getNode(), node => $isDetailsNode(node) && !node.getOpen())?.getKey() ?? null
          })
          if (!hiddenIn || !lexical.isEditable())
            return
          lexical.update(() => {
            $addUpdateTag(HISTORY_MERGE_TAG)
            const details = $getNodeByKey(hiddenIn)
            if ($isDetailsNode(details))
              $moveCaretAfter(details)
          })
        }),

        lexical.registerCommand(INSERT_CALLOUT_COMMAND, (kind) => {
          if (kind === 'alert')
            $insertCallout($createAlertNode())
          else if (kind === 'banner')
            $insertCallout($createBannerNode())
          else
            $insertCallout($createDetailsNode(DEFAULT_SUMMARY, true))
          return true
        }, COMMAND_PRIORITY_EDITOR),

        lexical.registerCommand(KEY_ENTER_COMMAND, (event) => {
          const found = $caretBlock()
          if (!found || event?.shiftKey)
            return false
          const { block, callout } = found
          if (!$isBlank(block) || !block.is(callout.getLastChild()) || callout.getChildrenSize() < 2)
            return false
          event?.preventDefault()
          block.remove()
          const paragraph = $createParagraphNode()
          callout.insertAfter(paragraph)
          paragraph.selectStart()
          return true
        }, COMMAND_PRIORITY_LOW),

        lexical.registerCommand(KEY_BACKSPACE_COMMAND, (event) => {
          const found = $caretBlock()
          if (found && $isBlank(found.block) && found.callout.getChildrenSize() === 1) {
            event?.preventDefault()
            const paragraph = $createParagraphNode()
            found.callout.replace(paragraph)
            paragraph.selectStart()
            return true
          }
          // The caret at the start of a block has nowhere to merge to.
          const selection = $getSelection()
          if (found && $isRangeSelection(selection) && selection.anchor.offset === 0 && found.block.is(found.callout.getFirstChild())) {
            const anchor = selection.anchor.getNode()
            if (!$isTextNode(anchor) || anchor.is(found.block.getFirstDescendant())) {
              event?.preventDefault()
              return true
            }
          }
          return false
        }, COMMAND_PRIORITY_LOW),

        lexical.registerCommand(KEY_ARROW_UP_COMMAND, (event) => {
          if (event?.shiftKey || !moveAround('up'))
            return false
          event?.preventDefault()
          return true
        }, COMMAND_PRIORITY_LOW),

        lexical.registerCommand(KEY_ARROW_DOWN_COMMAND, (event) => {
          if (event?.shiftKey || !moveAround('down'))
            return false
          event?.preventDefault()
          return true
        }, COMMAND_PRIORITY_LOW),
      )
    })

    return () => visible.value
      ? h(CalloutBar, { state: visible.value, editor })
      : null
  },
})
