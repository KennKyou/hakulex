import type { NodeKey } from 'lexical'
import type { ShallowRef } from 'vue'
import {
  $createNodeSelection,
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  $setSelection,
} from 'lexical'
import { shallowRef } from 'vue'
import { useLexicalComposer } from '../composer'
import { useLexicalRegister } from './useLexicalRegister'

function $isSelected(key: NodeKey): boolean {
  const selection = $getSelection()
  return $isNodeSelection(selection) && selection.has(key)
}

/** NodeSelection state of one node, for decorator components. */
export function useLexicalNodeSelection(nodeKey: NodeKey): {
  isSelected: Readonly<ShallowRef<boolean>>
  /** Adds the node to (or removes it from) the current NodeSelection. */
  setSelected: (selected: boolean) => void
  /** Clears the NodeSelection. */
  clearSelection: () => void
} {
  const editor = useLexicalComposer()
  const isSelected = shallowRef(editor.getEditorState().read(() => $isSelected(nodeKey)))

  useLexicalRegister(editor => editor.registerUpdateListener(({ editorState }) => {
    isSelected.value = editorState.read(() => $isSelected(nodeKey))
  }))

  const setSelected = (selected: boolean) => {
    editor.update(() => {
      if (!$getNodeByKey(nodeKey))
        return
      const current = $getSelection()
      const selection = $isNodeSelection(current)
        ? current
        : $createNodeSelection()
      $setSelection(selection)
      if (selected)
        selection.add(nodeKey)
      else
        selection.delete(nodeKey)
    })
  }

  const clearSelection = () => {
    editor.update(() => {
      const selection = $getSelection()
      if ($isNodeSelection(selection))
        selection.clear()
    })
  }

  return { isSelected, setSelected, clearSelection }
}
