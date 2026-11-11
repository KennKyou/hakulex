import type { LexicalEditor, NodeKey } from 'lexical'
import { createDecoratorChannel } from '../decorator-channel'

export type CaretPlacement = 'start' | 'end'

const channel = createDecoratorChannel<CaretPlacement>()

/** Code block components register here so plugins can move the caret into them. */
export const registerCodeBlockFocuser = channel.register

/** Focuses the CodeMirror inside a code block, now or as soon as it mounts. */
export function focusCodeBlock(editor: LexicalEditor, key: NodeKey, placement: CaretPlacement): void {
  channel.request(editor, key, placement)
}
