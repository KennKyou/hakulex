import type { ElementTransformer, MultilineElementTransformer, TextMatchTransformer, Transformer } from '@lexical/markdown'
import { chartTable, chatParticipantName, normalizeChat, normalizeGallery, normalizeLinkCard, normalizePoll, normalizeSnippetFiles, parseChartSource } from '@hakulex/renderer'
import { $createLinkNode, LinkNode } from '@lexical/link'
import {
  $convertToMarkdownString,
  CHECK_LIST,
  HEADING,
  ORDERED_LIST,
  QUOTE,
  TEXT_FORMAT_TRANSFORMERS,
  TEXT_MATCH_TRANSFORMERS,
  UNORDERED_LIST,
} from '@lexical/markdown'
import { $createTextNode } from 'lexical'
import { createCalloutTransformers } from './callout/transformers'
import { $replaceWithCodeBlock, FENCE_START } from './code/fence'
import { FOOTNOTE_DEFINITION, FOOTNOTE_REFERENCE } from './footnote/transformers'
import { IMAGE } from './image/transformer'
import { INLINE_TEXT_MATCH_TRANSFORMERS, UNDERLINE_MARKDOWN } from './inline/transformers'
import { MATH_BLOCK, MATH_INLINE } from './math/transformers'
import { FILE, FILE_INLINE, VIDEO } from './media/transformers'
import { MERMAID } from './mermaid/transformer'
import { latestState } from './nested/content'
import { $isChartNode } from './nodes/ChartNode'
import { $isChatNode } from './nodes/ChatNode'
import { $createCodeBlockNode, $isCodeBlockNode, CodeBlockNode } from './nodes/CodeBlockNode'
import { $isCodeSnippetNode } from './nodes/CodeSnippetNode'
import { $isEmbedNode, EmbedNode } from './nodes/EmbedNode'
import { $isGalleryNode } from './nodes/GalleryNode'
import { $isGridNode } from './nodes/GridNode'
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
} from './nodes/HorizontalRuleNode'
import { $isLinkCardNode } from './nodes/LinkCardNode'
import { $isNestedDocNode } from './nodes/NestedDocNode'
import { $isPollNode } from './nodes/PollNode'
import { $isStepsNode } from './nodes/StepsNode'
import { createTableTransformer } from './table/transformer'

/** `---`, `***` or `___` on its own line becomes a divider. */
export const HORIZONTAL_RULE: ElementTransformer = {
  type: 'element',
  dependencies: [HorizontalRuleNode],
  export: node => ($isHorizontalRuleNode(node)
    ? '***'
    : null),
  regExp: /^(?:---|\*\*\*|___)\s?$/,
  replace: (parentNode, _children, _match, isImport) => {
    const rule = $createHorizontalRuleNode()
    // While typing, keep the (now empty) paragraph after the rule for the caret.
    if (isImport || parentNode.getNextSibling() !== null)
      parentNode.replace(rule)
    else
      parentNode.insertBefore(rule)
    rule.selectNext()
  },
}

/** A fence longer than any backtick run inside the code. */
function fenceFor(code: string): string {
  const longest = Math.max(2, ...(code.match(/`+/g) ?? []).map(run => run.length))
  return '`'.repeat(longest + 1)
}

/**
 * Fenced code. Import reads up to the closing fence (or the end); typing
 * "```" or "```ts" followed by a space turns the paragraph into a code block.
 */
export const CODE_BLOCK: MultilineElementTransformer = {
  type: 'multiline-element',
  dependencies: [CodeBlockNode],
  regExpStart: FENCE_START,
  regExpEnd: { optional: true, regExp: /^[ \t]*`{3,}[ \t]*$/ },
  export: (node) => {
    if (!$isCodeBlockNode(node))
      return null
    const code = node.getCode()
    const fence = fenceFor(code)
    const language = node.getLanguage() === 'plaintext'
      ? ''
      : node.getLanguage()
    return `${fence}${language}\n${code}\n${fence}`
  },
  handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex, startMatch }) => {
    const closing = new RegExp(`^[ \\t]*\`{${startMatch[1].length},}[ \\t]*$`)
    let end = startLineIndex + 1
    while (end < lines.length && !closing.test(lines[end]))
      end++
    const code = lines.slice(startLineIndex + 1, end).join('\n')
    rootNode.append($createCodeBlockNode(code, startMatch[2]))
    return [
      true,
      Math.min(end, lines.length - 1),
    ]
  },
  replace: (rootNode, children, startMatch, _endMatch, _lines, isImport) => {
    if (isImport || !children)
      return false
    // Text after the caret when the fence was typed becomes the code.
    $replaceWithCodeBlock(rootNode, startMatch[2] ?? '', children.map(child => child.getTextContent()).join(''))
  },
}

// Cells export with the whole list, this transformer included, so it is read lazily.
// eslint-disable-next-line ts/no-use-before-define
export const TABLE = createTableTransformer(() => builtinTransformers)

// Likewise: blocks hold any content.
// eslint-disable-next-line ts/no-use-before-define
export const [ALERT, CONTAINER] = createCalloutTransformers(() => builtinTransformers)

// Export only, or import only: the other direction has to match nothing.
// eslint-disable-next-line regexp/no-empty-character-class
const NEVER = /[^\s\S]/

/** Export only: Markdown can't say an embed, so it goes out as a URL and comes back as a link. */
export const EMBED: ElementTransformer = {
  type: 'element',
  dependencies: [EmbedNode],
  export: (node) => {
    if (!$isEmbedNode(node))
      return null
    return node.getUrl()
      ? `<${node.getUrl()}>`
      : ''
  },
  regExp: NEVER,
  replace: () => false,
}

/** Export only, as a link. Pasted back, that is what it is. */
export const LINK_CARD: ElementTransformer = {
  type: 'element',
  // None, though it needs cards: their component uses this list, so LinkCardNode isn't defined yet here.
  dependencies: [],
  export: (node) => {
    if (!$isLinkCardNode(node))
      return null
    const card = normalizeLinkCard(node.getFields())
    if (!card)
      return ''
    if (!card.href)
      return card.title
    return card.title === card.href
      ? `<${card.href}>`
      : `[${card.title.replace(/[[\]]/g, '\\$&')}](${card.href})`
  },
  regExp: NEVER,
  replace: () => false,
}

function tableCell(value: unknown) {
  return (value === null || value === undefined
    ? ''
    : String(value)).replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

/** Export only: the data as a table, or the spec when it isn't valid. */
export const CHART: ElementTransformer = {
  type: 'element',
  // None, though it needs charts: their component uses this list, so ChartNode isn't defined yet here.
  dependencies: [],
  export: (node) => {
    if (!$isChartNode(node))
      return null
    const spec = node.getFields().spec
    const parsed = parseChartSource(spec)
    if (!parsed.ok) {
      return `\`\`\`json\n${typeof spec === 'string'
        ? spec
        : ''}\n\`\`\``
    }
    const { columns, rows } = chartTable(parsed.spec)
    const line = (cells: unknown[]) => `| ${cells.map(tableCell).join(' | ')} |`
    return [
      line(columns),
      line(columns.map(() => '---')),
      ...rows.map(line),
    ].join('\n')
  },
  regExp: NEVER,
  replace: () => false,
}

/** Export only: the question and a list. Votes aren't in the document. */
export const POLL: ElementTransformer = {
  type: 'element',
  // None, though it needs polls: their component uses this list, so PollNode isn't defined yet here.
  dependencies: [],
  export: (node) => {
    if (!$isPollNode(node))
      return null
    const poll = normalizePoll(node.getFields())
    if (!poll)
      return ''
    return [
      poll.question,
      poll.options.map(option => `- ${option.label}`).join('\n'),
    ].filter(Boolean).join('\n\n')
  },
  regExp: NEVER,
  replace: () => false,
}

const escapeAttribute = (value: string) => value.replace(/\s+/g, ' ').replace(/["\\]/g, '\\$&')

/** Export only. Pasted back, this is text: nothing here reads it as steps. */
export const STEPS: ElementTransformer = {
  type: 'element',
  // None, though it needs steps: their component uses this list, so StepsNode isn't defined yet here.
  dependencies: [],
  export: (node) => {
    if (!$isStepsNode(node))
      return null
    const body = node.getSteps().map((step) => {
      // eslint-disable-next-line ts/no-use-before-define
      const content = latestState(step.editor).read(() => $convertToMarkdownString(builtinTransformers))
      return `::: step{title="${escapeAttribute(step.title)}"}\n${content}\n:::`
    })
    return ['::: steps', ...body, ':::'].join('\n')
  },
  regExp: NEVER,
  replace: () => false,
}

/** Export only. Pasted back, this is text and code blocks. */
export const CODE_SNIPPET: ElementTransformer = {
  type: 'element',
  // None, though it needs its node: as with STEPS, the node isn't defined yet here.
  dependencies: [],
  export: (node) => {
    if (!$isCodeSnippetNode(node))
      return null
    const files = normalizeSnippetFiles(node.getFiles()).map(({ filename, code, language }) => {
      const fence = fenceFor(code)
      return [
        `::: file{name="${escapeAttribute(filename || 'untitled')}" lang="${escapeAttribute(language ?? '')}"}`,
        `${fence}${language ?? ''}`,
        code,
        fence,
        ':::',
      ].join('\n')
    })
    return ['::: code-snippet', ...files, ':::'].join('\n')
  },
  regExp: NEVER,
  replace: () => false,
}

/** Export only. Pasted back, these are images. */
export const GALLERY: ElementTransformer = {
  type: 'element',
  // None, though it needs its node: as with STEPS, the node isn't defined yet here.
  dependencies: [],
  export: node => ($isGalleryNode(node)
    ? normalizeGallery(node.getFields()).images.map(({ alt, src }) => `![${alt}](${src})`).join('\n')
    : null),
  regExp: NEVER,
  replace: () => false,
}

/** Export only. Pasted back, these are quotes and paragraphs. */
export const CHAT: ElementTransformer = {
  type: 'element',
  // None, though it needs its node: as with STEPS, the node isn't defined yet here.
  dependencies: [],
  export: (node) => {
    if (!$isChatNode(node))
      return null
    const { variant, participants, messages } = normalizeChat(node.getFields())
    return messages.map(({ participantId, content }) => {
      const participant = participants.find(item => item.id === participantId)
      if (variant === 'user-agent' && participant?.kind === 'agent')
        return content
      return content.split('\n').map((line, index) => (index === 0
        ? `> **${chatParticipantName(participant)}：** ${line}`
        : `> ${line}`)).join('\n')
    }).join('\n\n')
  },
  regExp: NEVER,
  replace: () => false,
}

/** Export only. Pasted back, this is text. */
export const NESTED_DOC: ElementTransformer = {
  type: 'element',
  // None, though it needs its node: as with STEPS, the node isn't defined yet here.
  dependencies: [],
  export: (node) => {
    if (!$isNestedDocNode(node))
      return null
    // eslint-disable-next-line ts/no-use-before-define
    const body = latestState(node.getContent().editor).read(() => $convertToMarkdownString(builtinTransformers))
    return `<nested-doc>\n${body}\n</nested-doc>`
  },
  regExp: NEVER,
  replace: () => false,
}

/** Export only. Pasted back, this is text. */
export const GRID: ElementTransformer = {
  type: 'element',
  // None, though it needs its node: as with STEPS, the node isn't defined yet here.
  dependencies: [],
  export: (node) => {
    if (!$isGridNode(node))
      return null
    const cells = node.getCells().map((cell) => {
      // eslint-disable-next-line ts/no-use-before-define
      const body = latestState(cell.editor).read(() => $convertToMarkdownString(builtinTransformers))
      return `::: cell\n${body}\n:::`
    })
    return [`::: grid{cols=${node.getCols()} gap="${escapeAttribute(node.getGap())}"}`, ...cells, ':::'].join('\n')
  },
  regExp: NEVER,
  replace: () => false,
}

/** `<https://...>`, Markdown's own way of writing a link, on import. */
export const ANGLE_LINK: TextMatchTransformer = {
  type: 'text-match',
  dependencies: [LinkNode],
  importRegExp: /<(https?:\/\/[^\s<>]+)>/,
  regExp: NEVER,
  replace: (textNode, match) => {
    textNode.replace($createLinkNode(match[1]).append($createTextNode(match[1])))
  },
  export: () => null,
}

/**
 * Markdown shortcuts matching `builtinNodes`.
 * CHECK_LIST must come before UNORDERED_LIST so markdown import reads `- [ ] ` as a
 * check item. While typing, `[ ] ` makes a check list; `- ` already became a bullet.
 */
export const builtinTransformers: Transformer[] = [
  MERMAID,
  CODE_BLOCK,
  MATH_BLOCK,
  TABLE,
  ALERT,
  CONTAINER,
  IMAGE,
  VIDEO,
  FILE,
  EMBED,
  LINK_CARD,
  POLL,
  CHART,
  STEPS,
  NESTED_DOC,
  GRID,
  CODE_SNIPPET,
  GALLERY,
  CHAT,
  FOOTNOTE_DEFINITION,
  HORIZONTAL_RULE,
  HEADING,
  QUOTE,
  CHECK_LIST,
  UNORDERED_LIST,
  ORDERED_LIST,
  ...TEXT_FORMAT_TRANSFORMERS,
  UNDERLINE_MARKDOWN,
  MATH_INLINE,
  FILE_INLINE,
  FOOTNOTE_REFERENCE,
  ...INLINE_TEXT_MATCH_TRANSFORMERS,
  ANGLE_LINK,
  ...TEXT_MATCH_TRANSFORMERS,
]
