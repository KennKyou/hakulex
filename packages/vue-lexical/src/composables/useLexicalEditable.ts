import type { ShallowRef } from 'vue'
import { shallowRef } from 'vue'
import { useLexicalComposer } from '../composer'
import { useLexicalRegister } from './useLexicalRegister'

/** Tracks `editor.isEditable()` as a ref. */
export function useLexicalEditable(): Readonly<ShallowRef<boolean>> {
  const editor = useLexicalComposer()
  const editable = shallowRef(editor.isEditable())

  useLexicalRegister(editor => editor.registerEditableListener((value) => {
    editable.value = value
  }))

  return editable
}
