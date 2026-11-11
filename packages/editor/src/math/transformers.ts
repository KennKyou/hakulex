import type { MultilineElementTransformer, TextMatchTransformer } from '@lexical/markdown'
import {
  $createKaTeXBlockNode,
  $createKaTeXInlineNode,
  $isKaTeXBlockNode,
  $isKaTeXInlineNode,
  KaTeXBlockNode,
  KaTeXInlineNode,
} from '../nodes/MathNodes'
import { $replaceWithMathBlock } from './insert'

// Pandoc's rule keeps prices like "$5 and $10" as text: the content may not start
// or end with whitespace, `\$` is a literal dollar, and the closing `$` may not be
// followed by a digit.
const INLINE_BODY = String.raw`(?<!\\)\$([^\s$](?:[^$\n]*?[^\s$\\])?)\$`

/** `$E=mc^2$` → inline equation, while typing (on the closing `$`) and on import. */
export const MATH_INLINE: TextMatchTransformer = {
  type: 'text-match',
  dependencies: [KaTeXInlineNode],
  trigger: '$',
  importRegExp: new RegExp(`${INLINE_BODY}(?!\\d)`),
  regExp: new RegExp(`${INLINE_BODY}$`),
  replace: (textNode, match) => {
    textNode.replace($createKaTeXInlineNode(match[1]))
  },
  export: node => ($isKaTeXInlineNode(node)
    ? `$${node.getEquation()}$`
    : null),
}

const BLOCK_END = /^[ \t]*\$\$[ \t]*$/

/**
 * `$$ ... $$` on one line, or `$$` / lines / `$$`. Typing "$$" and a space
 * turns the paragraph into an equation and opens its editor ("$$" + Enter is
 * handled by MathPlugin).
 */
export const MATH_BLOCK: MultilineElementTransformer = {
  type: 'multiline-element',
  dependencies: [KaTeXBlockNode],
  regExpStart: /^[ \t]*\$\$(.*)$/,
  regExpEnd: { optional: true, regExp: BLOCK_END },
  export: node => ($isKaTeXBlockNode(node)
    ? `$$\n${node.getEquation()}\n$$`
    : null),
  handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex, startMatch }) => {
    const rest = startMatch[1].trim()
    // Single line: $$ x^2 $$
    if (rest.length > 2 && rest.endsWith('$$')) {
      rootNode.append($createKaTeXBlockNode(rest.slice(0, -2).trim()))
      return [true, startLineIndex]
    }
    let end = startLineIndex + 1
    while (end < lines.length && !BLOCK_END.test(lines[end]))
      end++
    const body = [
      rest,
      ...lines.slice(startLineIndex + 1, end),
    ].join('\n').trim()
    rootNode.append($createKaTeXBlockNode(body))
    return [
      true,
      Math.min(end, lines.length - 1),
    ]
  },
  replace: (rootNode, children, _startMatch, _endMatch, _lines, isImport) => {
    if (isImport || !children)
      return false
    $replaceWithMathBlock(rootNode, '')
  },
}
