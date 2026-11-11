import type { TextFormatTransformer, TextMatchTransformer } from '@lexical/markdown'
import type { TextFormatType, TextNode } from 'lexical'
import { safeCommentText } from '@hakulex/renderer'
import { $createTextNode, $getSelection, $isRangeSelection, $isTextNode, TEXT_TYPE_TO_FORMAT } from 'lexical'
import { $createCommentNode, $isCommentNode, CommentNode } from '../nodes/CommentNode'
import { $createRubyNode, $createSpoilerNode, $isRubyNode, $isSpoilerNode, RubyNode, SpoilerNode } from '../nodes/InlineNodes'
import { $createMentionNode, $isMentionNode, MentionNode } from '../nodes/MentionNode'
import { $createTagNode, $isTagNode, TagNode } from '../nodes/TagNode'
import {
  COMMENT_IMPORT,
  COMMENT_TYPED,
  MENTION_IMPORT,
  MENTION_TYPED,
  RUBY_IMPORT,
  SPOILER_IMPORT,
  SUBSCRIPT_IMPORT,
  SUBSCRIPT_TYPED,
  SUPERSCRIPT_IMPORT,
  SUPERSCRIPT_TYPED,
  TAG_IMPORT,
  TAG_TYPED,
} from './syntax'

/** A text node for what is inside a marker. Returning it has Lexical read the formats in there. */
const $innerText = (from: TextNode, text: string) => $createTextNode(text).setFormat(from.getFormat())

/** `||text||`, on import. Typing goes through InlineSyntaxPlugin, since it can span formats. */
export const SPOILER_MARKDOWN: TextMatchTransformer = {
  type: 'text-match',
  dependencies: [SpoilerNode],
  importRegExp: SPOILER_IMPORT,
  regExp: SPOILER_IMPORT,
  replace: (textNode, match) => {
    const inner = $innerText(textNode, match[1])
    textNode.replace($createSpoilerNode().append(inner))
    return inner
  },
  export: (node, exportChildren) => ($isSpoilerNode(node)
    ? `||${exportChildren(node)}||`
    : null),
}

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
}
const escapeReading = (reading: string) => reading.replace(/[&<>"]/g, char => ENTITIES[char])
function unescapeReading(reading: string) {
  return reading
    .replace(/&(?:lt|gt|quot);/g, entity => Object.keys(ENTITIES).find(char => ENTITIES[char] === entity)!)
    .replace(/&amp;/g, '&')
}

/** `<ruby>base<rt>reading</rt></ruby>`, on import only: nobody types that much HTML. */
export const RUBY_MARKDOWN: TextMatchTransformer = {
  type: 'text-match',
  dependencies: [RubyNode],
  importRegExp: RUBY_IMPORT,
  regExp: RUBY_IMPORT,
  replace: (textNode, match) => {
    const inner = $innerText(textNode, match[1])
    textNode.replace($createRubyNode(unescapeReading(match[2])).append(inner))
    return inner
  },
  export: (node, exportChildren) => {
    if (!$isRubyNode(node))
      return null
    const reading = node.getReading()
    return reading
      ? `<ruby>${exportChildren(node)}<rt>${escapeReading(reading)}</rt></ruby>`
      : exportChildren(node)
  },
}

/**
 * Text-match rather than text-format: Lexical's text formats allow spaces inside,
 * so `3~5 和 7~9` would become a subscript.
 */
function createScriptTransformer(format: TextFormatType, marker: string, importRegExp: RegExp, regExp: RegExp): TextMatchTransformer {
  return {
    type: 'text-match',
    dependencies: [],
    trigger: marker,
    importRegExp,
    regExp,
    replace: (textNode, match) => {
      textNode.setTextContent(match[1])
      if (!textNode.hasFormat(format))
        textNode.toggleFormat(format)
      // Just typed at the end of the line: what comes next shouldn't take the format.
      const selection = $getSelection()
      if ($isRangeSelection(selection) && selection.isCollapsed() && selection.anchor.getNode().is(textNode.getParent()))
        textNode.selectEnd().setFormat(textNode.getFormat() & ~TEXT_TYPE_TO_FORMAT[format])
      return textNode
    },
    export: (node, _exportChildren, exportFormat) => {
      if (!$isTextNode(node) || !node.hasFormat(format))
        return null
      // Spaces stay as numeric references and the marker escaped, as Lexical does at edges.
      const inner = exportFormat(node, node.getTextContent())
        .replace(/\s/g, space => `&#${space.charCodeAt(0)};`)
        // Lexical already escapes `~`.
        .replace(/\^/g, '\\^')
      return `${marker}${inner}${marker}`
    },
  }
}

export const SUPERSCRIPT_MARKDOWN = createScriptTransformer('superscript', '^', SUPERSCRIPT_IMPORT, SUPERSCRIPT_TYPED)
export const SUBSCRIPT_MARKDOWN = createScriptTransformer('subscript', '~', SUBSCRIPT_IMPORT, SUBSCRIPT_TYPED)

export const UNDERLINE_MARKDOWN: TextFormatTransformer = {
  type: 'text-format',
  format: ['underline'],
  tag: '++',
}

/** Swaps the text for `node`. If the caret was in it, as when typing, it goes after the new node. */
function $replaceWith(textNode: TextNode, node: TextNode) {
  const selection = $getSelection()
  const caretHere = $isRangeSelection(selection) && selection.anchor.getNode().is(textNode)
  textNode.replace(node)
  if (caretHere)
    node.selectEnd()
}

export const TAG_MARKDOWN: TextMatchTransformer = {
  type: 'text-match',
  dependencies: [TagNode],
  trigger: '>',
  importRegExp: TAG_IMPORT,
  regExp: TAG_TYPED,
  replace: (textNode, match) => $replaceWith(textNode, $createTagNode(unescapeReading(match[1])).setFormat(textNode.getFormat())),
  export: node => ($isTagNode(node)
    ? `<tag>${escapeReading(node.getTextContent())}</tag>`
    : null),
}

export const COMMENT_MARKDOWN: TextMatchTransformer = {
  type: 'text-match',
  dependencies: [CommentNode],
  trigger: '>',
  importRegExp: COMMENT_IMPORT,
  regExp: COMMENT_TYPED,
  replace: (textNode, match) => $replaceWith(textNode, $createCommentNode(match[1])),
  export: node => ($isCommentNode(node)
    ? `<!--${safeCommentText(node.getTextContent())}-->`
    : null),
}

export const MENTION_MARKDOWN: TextMatchTransformer = {
  type: 'text-match',
  dependencies: [MentionNode],
  trigger: '}',
  importRegExp: MENTION_IMPORT,
  regExp: MENTION_TYPED,
  replace: (textNode, match) => {
    const selection = $getSelection()
    const caretHere = $isRangeSelection(selection) && selection.anchor.getNode().is(textNode)
    const mention = $createMentionNode(match[2], match[3], match[1])
    textNode.replace(mention)
    if (caretHere)
      mention.selectNext()
  },
  export: (node) => {
    if (!$isMentionNode(node))
      return null
    const { platform, handle, displayName } = node.getData()
    return `${displayName
      ? `[${displayName}]`
      : ''}{${platform}@${handle}}`
  },
}

export const INLINE_TEXT_MATCH_TRANSFORMERS: TextMatchTransformer[] = [
  MENTION_MARKDOWN,
  TAG_MARKDOWN,
  COMMENT_MARKDOWN,
  SPOILER_MARKDOWN,
  RUBY_MARKDOWN,
  SUPERSCRIPT_MARKDOWN,
  SUBSCRIPT_MARKDOWN,
]
