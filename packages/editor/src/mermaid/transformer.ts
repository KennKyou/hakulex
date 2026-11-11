import type { MultilineElementTransformer } from '@lexical/markdown'
import { $createMermaidNode, $isMermaidNode, MermaidNode } from '../nodes/MermaidNode'
import { $replaceWithMermaid } from './insert'

/**
 * ```mermaid fences. Must come before CODE_BLOCK, which would otherwise take
 * them as code. Typing "```mermaid" + space starts a diagram ("+ Enter" is
 * handled by MermaidPlugin).
 */
export const MERMAID: MultilineElementTransformer = {
  type: 'multiline-element',
  dependencies: [MermaidNode],
  regExpStart: /^[ \t]*(`{3,})mermaid(?:[ \t]|$)/i,
  regExpEnd: { optional: true, regExp: /^[ \t]*`{3,}[ \t]*$/ },
  export: (node) => {
    if (!$isMermaidNode(node))
      return null
    const diagram = node.getDiagram()
    const longest = Math.max(2, ...(diagram.match(/`+/g) ?? []).map(run => run.length))
    const fence = '`'.repeat(longest + 1)
    return `${fence}mermaid\n${diagram}\n${fence}`
  },
  handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex, startMatch }) => {
    const closing = new RegExp(`^[ \\t]*\`{${startMatch[1].length},}[ \\t]*$`)
    let end = startLineIndex + 1
    while (end < lines.length && !closing.test(lines[end]))
      end++
    rootNode.append($createMermaidNode(lines.slice(startLineIndex + 1, end).join('\n')))
    return [
      true,
      Math.min(end, lines.length - 1),
    ]
  },
  replace: (rootNode, children, _startMatch, _endMatch, _lines, isImport) => {
    if (isImport || !children)
      return false
    $replaceWithMermaid(rootNode, '')
  },
}
