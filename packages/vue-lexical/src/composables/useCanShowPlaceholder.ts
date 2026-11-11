import type { LexicalEditor } from 'lexical'
import type { ShallowRef } from 'vue'
import { $canShowPlaceholderCurry } from '@lexical/text'
import { mergeRegister } from '@lexical/utils'
import { shallowRef } from 'vue'
import { useLexicalComposer } from '../composer'
import { useLexicalRegister } from './useLexicalRegister'

function canShowPlaceholder(editor: LexicalEditor): boolean {
  return editor.getEditorState().read($canShowPlaceholderCurry(editor.isComposing()))
}

/** True while the document is empty and no IME composition is in progress. */
export function useCanShowPlaceholder(): Readonly<ShallowRef<boolean>> {
  const editor = useLexicalComposer()
  const canShow = shallowRef(canShowPlaceholder(editor))

  useLexicalRegister((editor) => {
    const update = () => {
      canShow.value = canShowPlaceholder(editor)
    }
    update()
    return mergeRegister(
      editor.registerUpdateListener(update),
      editor.registerEditableListener(update),
    )
  })

  return canShow
}
