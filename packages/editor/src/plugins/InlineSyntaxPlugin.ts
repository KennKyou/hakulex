import type { LexicalEditor } from 'lexical'
import { useLexicalRegister } from '@hakulex/vue-lexical'
import { mergeRegister } from '@lexical/utils'
import {
  $addUpdateTag,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  DELETE_CHARACTER_COMMAND,
  HISTORIC_TAG,
  HISTORY_PUSH_TAG,
  SELECTION_CHANGE_COMMAND,
} from 'lexical'
import { defineComponent } from 'vue'
import { $deleteCharacterInRuby, $moveCaretOutOfWrapper, $setRuby, $toggleSpoiler } from '../inline/commands'
import { $convertTypedSpoiler } from '../inline/typing'
import { SET_RUBY_COMMAND, SpoilerNode, TOGGLE_SPOILER_COMMAND } from '../nodes/InlineNodes'

const HIDDEN = 'hlx-spoiler--hidden'

/** What readers get while read-only: a control, starting hidden. While editing it is plain text. */
function syncSpoiler(element: HTMLElement, editable: boolean) {
  element.classList.add(HIDDEN)
  element.removeAttribute('data-rehidden')
  if (editable) {
    element.removeAttribute('role')
    element.removeAttribute('tabindex')
    element.removeAttribute('aria-expanded')
  }
  else {
    element.setAttribute('role', 'button')
    element.setAttribute('tabindex', '0')
    element.setAttribute('aria-expanded', 'false')
  }
}

function toggleSpoiler(element: HTMLElement) {
  const hidden = element.classList.toggle(HIDDEN)
  element.setAttribute('aria-expanded', String(!hidden))
  // Hover and focus show hidden text, so hiding it needs this until they end.
  if (hidden)
    element.setAttribute('data-rehidden', '')
  else
    element.removeAttribute('data-rehidden')
}

function spoilerAt(target: EventTarget | null) {
  return target instanceof Element
    ? target.closest<HTMLElement>('.hlx-spoiler')
    : null
}

/** Same behaviour as the renderer's SpoilerView, on DOM that Lexical owns. */
function listenForReaders(editor: LexicalEditor, root: HTMLElement) {
  const onClick = (event: MouseEvent) => {
    const spoiler = spoilerAt(event.target)
    if (!spoiler || editor.isEditable())
      return
    if (spoiler.classList.contains(HIDDEN))
      event.preventDefault()
    else if ((event.target as Element).closest('a'))
      return
    toggleSpoiler(spoiler)
  }
  const onKeydown = (event: KeyboardEvent) => {
    const spoiler = spoilerAt(event.target)
    if (!spoiler || editor.isEditable() || event.target !== spoiler || (event.key !== 'Enter' && event.key !== ' '))
      return
    event.preventDefault()
    toggleSpoiler(spoiler)
  }
  const onLeave = (event: Event) => spoilerAt(event.target)?.removeAttribute('data-rehidden')

  root.addEventListener('click', onClick)
  root.addEventListener('keydown', onKeydown)
  root.addEventListener('mouseout', onLeave)
  root.addEventListener('focusout', onLeave)
  return () => {
    root.removeEventListener('click', onClick)
    root.removeEventListener('keydown', onKeydown)
    root.removeEventListener('mouseout', onLeave)
    root.removeEventListener('focusout', onLeave)
  }
}

/** Spoiler and ruby commands, typing `||text||`, and spoilers for readers. */
export const InlineSyntaxPlugin = defineComponent({
  name: 'InlineSyntaxPlugin',
  setup() {
    useLexicalRegister((editor) => {
      let stopListening: (() => void) | undefined
      return mergeRegister(
        () => stopListening?.(),
        editor.registerRootListener((root) => {
          stopListening?.()
          stopListening = root
            ? listenForReaders(editor, root)
            : undefined
        }),
        editor.registerEditableListener((editable) => {
          editor.getRootElement()?.querySelectorAll<HTMLElement>('.hlx-spoiler').forEach(element => syncSpoiler(element, editable))
        }),
        editor.registerMutationListener(SpoilerNode, (mutations) => {
          for (const [key, mutation] of mutations) {
            const element = mutation === 'created' && editor.getElementByKey(key)
            if (element)
              syncSpoiler(element, editor.isEditable())
          }
        }),
        editor.registerCommand(TOGGLE_SPOILER_COMMAND, () => {
          const selection = $getSelection()
          if (!editor.isEditable() || !$isRangeSelection(selection) || !$toggleSpoiler(selection))
            return false
          $addUpdateTag(HISTORY_PUSH_TAG)
          return true
        }, COMMAND_PRIORITY_EDITOR),
        editor.registerCommand(SET_RUBY_COMMAND, (reading) => {
          const selection = $getSelection()
          if (!editor.isEditable() || !$isRangeSelection(selection) || !$setRuby(selection, reading))
            return false
          $addUpdateTag(HISTORY_PUSH_TAG)
          return true
        }, COMMAND_PRIORITY_EDITOR),
        editor.registerCommand(SELECTION_CHANGE_COMMAND, () => {
          const selection = $getSelection()
          if (editor.isEditable() && $isRangeSelection(selection))
            $moveCaretOutOfWrapper(selection)
          return false
        }, COMMAND_PRIORITY_LOW),
        editor.registerCommand(DELETE_CHARACTER_COMMAND, (backward) => {
          const selection = $getSelection()
          return $isRangeSelection(selection) && $deleteCharacterInRuby(selection, backward)
        }, COMMAND_PRIORITY_LOW),
        editor.registerUpdateListener(({ tags, dirtyLeaves, editorState, prevEditorState }) => {
          if (tags.has(HISTORIC_TAG) || !editor.isEditable() || editor.isComposing())
            return
          const selection = editorState.read($getSelection)
          const previous = prevEditorState.read($getSelection)
          if (!$isRangeSelection(selection) || !$isRangeSelection(previous) || !selection.isCollapsed() || selection.is(previous))
            return
          const { key, offset, type } = selection.anchor
          if (type !== 'text' || !dirtyLeaves.has(key) || offset < 2)
            return
          // One more character in the same node: anything else is a paste or a move.
          if (previous.anchor.key !== key || offset !== previous.anchor.offset + 1)
            return
          editor.update(() => {
            const node = $getNodeByKey(key)
            if ($isTextNode(node) && $convertTypedSpoiler(node, offset))
              $addUpdateTag(HISTORY_PUSH_TAG)
          })
        }),
      )
    })
    return () => null
  },
})
