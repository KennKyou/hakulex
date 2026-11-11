import type { SerializedEditorState } from 'lexical'
import { $toMarkdown, allHeadlessNodes, sanitizeSerializedState } from '@hakulex/headless'
import { createHeadlessEditor } from '@lexical/headless'

/**
 * The document as Markdown. Nodes it doesn't know are taken out
 * first (their text stays) and passed to `onUnknown`.
 */
export function renderMarkdown(state: SerializedEditorState, onUnknown?: (types: string[]) => void): string {
  const unknown: string[] = []
  const known = sanitizeSerializedState(state as { root?: Record<string, unknown> }, {
    nodes: allHeadlessNodes,
    onUnknown: type => unknown.push(type),
  })
  if (unknown.length)
    onUnknown?.(unknown)
  const editor = createHeadlessEditor({
    nodes: allHeadlessNodes,
    onError: (error) => {
      throw error
    },
  })
  return editor.parseEditorState(JSON.stringify(known)).read(() => $toMarkdown())
}
