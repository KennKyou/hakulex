import type { LexicalEditor, RangeSelection } from 'lexical'
import type { Ref, ShallowRef } from 'vue'
import type { ToolbarState } from './selection-state'
import { useLexicalComposer, useLexicalRegister } from '@hakulex/vue-lexical'
import { mergeRegister } from '@lexical/utils'
import {
  $getSelection,
  $isRangeSelection,
  BLUR_COMMAND,
  COMMAND_PRIORITY_LOW,
  FOCUS_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from 'lexical'
import { shallowRef } from 'vue'
import { $getToolbarState } from './selection-state'

function $getVisibleSelection(editor: LexicalEditor): RangeSelection | null {
  const selection = $getSelection()
  if (!editor.isEditable() || !$isRangeSelection(selection) || selection.isCollapsed())
    return null
  return selection.getTextContent().trim() === ''
    ? null
    : selection
}

/**
 * Tracks whether the toolbar should show and the format state of the selection.
 * Hidden while the pointer is down (drag-selecting) and when focus leaves the
 * editor for anything other than the toolbar itself.
 */
export function useToolbarVisibility(toolbar: Readonly<Ref<HTMLElement | null>>): {
  visible: Readonly<ShallowRef<boolean>>
  state: Readonly<ShallowRef<ToolbarState | null>>
  /** Bumps on every selection change; used to re-measure the anchor. */
  revision: Readonly<ShallowRef<number>>
} {
  const editor = useLexicalComposer()
  const visible = shallowRef(false)
  const state = shallowRef<ToolbarState | null>(null)
  const revision = shallowRef(0)
  let pointerDown = false

  const hide = () => {
    visible.value = false
  }

  const $update = () => {
    const selection = $getVisibleSelection(editor)
    const root = editor.getRootElement()
    const focused = !!root && root.contains(root.ownerDocument.activeElement)
    if (!selection || pointerDown || !focused) {
      hide()
      return
    }
    state.value = $getToolbarState(selection)
    visible.value = true
    revision.value++
  }
  const update = () => editor.getEditorState().read($update)

  useLexicalRegister(editor => mergeRegister(
    editor.registerUpdateListener(({ editorState }) => editorState.read($update)),
    editor.registerEditableListener(update),
    editor.registerCommand(SELECTION_CHANGE_COMMAND, () => {
      $update()
      return false
    }, COMMAND_PRIORITY_LOW),
    editor.registerCommand(FOCUS_COMMAND, () => {
      queueMicrotask(update)
      return false
    }, COMMAND_PRIORITY_LOW),
    editor.registerCommand(BLUR_COMMAND, (event) => {
      const next = event.relatedTarget
      if (!(next instanceof Node && toolbar.value?.contains(next)))
        hide()
      return false
    }, COMMAND_PRIORITY_LOW),
    editor.registerRootListener((root) => {
      if (!root)
        return
      const onPointerUp = () => {
        pointerDown = false
        // Let the browser settle the final selection first.
        setTimeout(update)
      }
      const onPointerDown = (event: PointerEvent) => {
        if (event.button !== 0)
          return
        pointerDown = true
        hide()
        root.ownerDocument.addEventListener('pointerup', onPointerUp, { once: true })
      }
      root.addEventListener('pointerdown', onPointerDown)
      return () => {
        root.removeEventListener('pointerdown', onPointerDown)
        root.ownerDocument.removeEventListener('pointerup', onPointerUp)
      }
    }),
  ))

  return { visible, state, revision }
}
