import type { ElementTransformer, TextMatchTransformer } from '@lexical/markdown'
import { $getRoot, $isRootNode, $isTextNode } from 'lexical'
import {
  $createFootnoteNode,
  $createFootnoteSectionNode,
  $isFootnoteNode,
  $isFootnoteSectionNode,
  FootnoteNode,
  FootnoteSectionNode,
} from '../nodes/FootnoteNodes'
import { $footnoteState, $scanFootnotes } from './document'

// Letters, digits and underscores, so `[^a-z]` in a regular expression stays text.
const IDENTIFIER = String.raw`[\p{L}\p{N}_]+`
// `[^1]:` opening a line is a definition, or text if it has no content. `[^1](x)` is a link.
const REFERENCE = String.raw`(?<!\\)(?:^\[\^(${IDENTIFIER})\](?![:(])|(?<=.)\[\^(${IDENTIFIER})\](?!\())`

export const FOOTNOTE_REFERENCE_SYNTAX = new RegExp(String.raw`(?<!\\)\[\^${IDENTIFIER}\]`, 'u')
export const FOOTNOTE_DEFINITION_SYNTAX = new RegExp(String.raw`^\[\^(${IDENTIFIER})\]:[\t ]+(\S.*)$`, 'mu')

/**
 * `[^1]`. While typing, only numbers: `[^abc]` is at least as likely to be about
 * regular expressions, and whoever wants that name can import or paste it.
 */
export const FOOTNOTE_REFERENCE: TextMatchTransformer = {
  type: 'text-match',
  dependencies: [FootnoteNode],
  trigger: ']',
  importRegExp: new RegExp(REFERENCE, 'u'),
  regExp: /(?<!\\)\[\^(\d+)\]$/,
  replace: (textNode, match) => {
    textNode.replace($createFootnoteNode(match[1] ?? match[2]))
  },
  export: node => ($isFootnoteNode(node)
    ? node.getTextContent()
    : null),
}

/**
 * `[^1]: content`, on import and at the top level only, so a line in a callout or
 * a table cell stays what it was. Content is stored as written: it is plain text,
 * and writing it back unchanged keeps any markdown in it.
 */
export const FOOTNOTE_DEFINITION: ElementTransformer = {
  type: 'element',
  dependencies: [FootnoteSectionNode],
  regExp: new RegExp(FOOTNOTE_DEFINITION_SYNTAX.source, 'u'),
  replace: (parentNode, children, match, isImport) => {
    if (!isImport || !$isRootNode(parentNode.getParent())) {
      // Lexical has already cut the match from the line, and doesn't put it back.
      if (isImport && $isTextNode(children[0]))
        children[0].setTextContent(match[0])
      return false
    }
    const existing = $getRoot().getChildren().find($isFootnoteSectionNode)
    if (existing) {
      existing.setDefinitions({
        ...existing.getDefinitions(),
        [match[1]]: match[2],
      })
      parentNode.remove()
    }
    else {
      parentNode.replace($createFootnoteSectionNode({ [match[1]]: match[2] }))
    }
  },
  export: (node) => {
    if (!$isFootnoteSectionNode(node))
      return null
    const { numbers } = $footnoteState($scanFootnotes())
    const order = (identifier: string) => numbers.get(identifier) ?? Number.POSITIVE_INFINITY
    return Object.entries(node.getDefinitions())
      .filter(([, content]) => content.trim())
      .sort(([a], [b]) => order(a) - order(b))
      .map(([identifier, content]) => `[^${identifier}]: ${content}`)
      .join('\n')
  },
}
