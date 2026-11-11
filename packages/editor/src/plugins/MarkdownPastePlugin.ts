import type { LexicalNode, SerializedLexicalNode } from 'lexical'
import type { PropType } from 'vue'
import type { EditorNode } from '../nodes'
import { validateUrl } from '@hakulex/renderer'
import { useLexicalRegister } from '@hakulex/vue-lexical'
import { $isLinkNode } from '@lexical/link'
import { $convertFromMarkdownString } from '@lexical/markdown'
import { $dfs } from '@lexical/utils'
import {
  $addUpdateTag,
  $createTextNode,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  $parseSerializedNode,
  COMMAND_PRIORITY_HIGH,
  createEditor,
  HISTORY_PUSH_TAG,
  PASTE_COMMAND,
} from 'lexical'
import { defineComponent } from 'vue'
import { $createCodeBlockNode } from '../nodes/CodeBlockNode'
import { hasRichHtml, isMarkdown, vscodeLanguage } from '../paste/detect'
import { builtinTransformers } from '../transformers'

/** Links with a scheme we don't allow go back to the text they came from. */
function $restoreUnsafeLinks() {
  for (const { node } of $dfs()) {
    if (!$isLinkNode(node))
      continue
    const url = node.getURL()
    if (/^[a-z][a-z\d+.-]*:/i.test(url) && !validateUrl(url))
      node.replace($createTextNode(`[${node.getTextContent()}](${url})`))
  }
}

/** Converts in a throwaway editor, so a failure can't touch the document. */
function $markdownToNodes(markdown: string, nodes: EditorNode[]): LexicalNode[] {
  let failed = false
  const scratch = createEditor({
    namespace: 'hakulex-markdown-paste',
    nodes,
    onError: () => {
      failed = true
    },
  })
  scratch.update(() => {
    $convertFromMarkdownString(markdown, builtinTransformers)
    $restoreUnsafeLinks()
  }, { discrete: true })
  if (failed)
    return []
  const children = scratch.getEditorState().toJSON().root.children as SerializedLexicalNode[]
  return children.map(child => $parseSerializedNode(child))
}

/** Pastes plain-text markdown as nodes and VS Code selections as code blocks. */
export const MarkdownPastePlugin = defineComponent({
  name: 'MarkdownPastePlugin',
  props: {
    /** The editor's own nodes, so everything the markdown produces can be inserted. */
    nodes: { type: Array as PropType<EditorNode[]>, required: true },
  },
  setup(props) {
    useLexicalRegister(editor => editor.registerCommand(PASTE_COMMAND, (event) => {
      const clipboard = 'clipboardData' in event
        ? event.clipboardData
        : null
      if (!clipboard || !$isRangeSelection($getSelection()))
        return false
      // Lexical's own format and image files have their own handling.
      if (clipboard.getData('application/x-lexical-editor')
        || [...clipboard.files].some(file => file.type.startsWith('image/'))) {
        return false
      }

      const text = clipboard.getData('text/plain').replace(/\r\n?/g, '\n')
      if (!text)
        return false

      const language = vscodeLanguage(clipboard.getData('vscode-editor-data'))
      if (language) {
        event.preventDefault()
        $addUpdateTag(HISTORY_PUSH_TAG)
        $insertNodes([
          $createCodeBlockNode(text, language),
        ])
        return true
      }

      if (hasRichHtml(clipboard.getData('text/html')) || !isMarkdown(text))
        return false
      const nodes = $markdownToNodes(text, props.nodes)
      if (!nodes.length)
        return false
      event.preventDefault()
      // Otherwise it merges with text typed just before, and undo takes both.
      $addUpdateTag(HISTORY_PUSH_TAG)
      $insertNodes(nodes)
      return true
    }, COMMAND_PRIORITY_HIGH))
    return () => null
  },
})
