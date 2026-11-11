import type {
  EditorState,
  EditorThemeClasses,
  HTMLConfig,
  LexicalEditor,
  LexicalNodeConfig,
} from 'lexical'
import type { InjectionKey } from 'vue'
import { inject } from 'vue'

export const LexicalEditorKey: InjectionKey<LexicalEditor> = Symbol('LexicalEditor')

/**
 * Initial content of the editor:
 * - `undefined`: an empty paragraph
 * - `null`: leave the root untouched (e.g. collaboration fills it)
 * - `string`: serialized editor state JSON
 * - `EditorState`: used as is
 * - function: called inside `editor.update()` to build the content
 */
export type InitialEditorState
  = | null
    | string
    | EditorState
    | ((editor: LexicalEditor) => void)

export interface InitialConfig {
  namespace: string
  nodes?: readonly LexicalNodeConfig[]
  theme?: EditorThemeClasses
  editable?: boolean
  editorState?: InitialEditorState
  html?: HTMLConfig
  onError?: (error: Error, editor: LexicalEditor) => void
}

/** Access the editor created by the nearest `<LexicalComposer>`. */
export function useLexicalComposer(): LexicalEditor {
  const editor = inject(LexicalEditorKey, null)
  if (!editor)
    throw new Error('useLexicalComposer: must be used inside <LexicalComposer>')
  return editor
}
