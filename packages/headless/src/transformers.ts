/*
 * Markdown from a document. Only out: the import side of each
 * transformer never matches. Nodes are read through `getData()`, which adds the default for a
 * field a node doesn't have, so the Markdown is complete even though the JSON is kept as it was.
 */

import type { ElementTransformer, TextFormatTransformer, TextMatchTransformer } from '@lexical/markdown'
import type { LexicalNode } from 'lexical'
import {
  $convertToMarkdownString,
  CHECK_LIST,

  TRANSFORMERS,
} from '@lexical/markdown'
import { $isTableCellNode, $isTableNode, $isTableRowNode } from '@lexical/table'
import { DataNode, DetailsNode, RubyNode, nestedText as stateText } from './nodes'

// ── Helpers ──

// eslint-disable-next-line regexp/no-useless-assertions -- intentionally never-matching regex for export-only transformers
const NEVER = /a^/
function NOOP() {}

function qA(v: string): string {
  return v.replaceAll('"', '\\"')
}

function escHtml(v: string): string {
  return v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function escCell(v: string): string {
  return v.replaceAll('|', '\\|').replaceAll('\n', '<br/>')
}

function fence(content: string): string {
  const m = content.match(/`+/g)
  const max = m?.reduce((a, r) => Math.max(a, r.length), 0) ?? 0
  return '`'.repeat(Math.max(3, max + 1))
}

/** A node's fields, with the defaults. */
function data(node: LexicalNode): any {
  return node instanceof DataNode
    ? node.getData()
    : node.exportJSON()
}

// ── TextMatch (inline) ──

export const SPOILER_TRANSFORMER: TextMatchTransformer = {
  dependencies: [],
  export: node => (node.getType() === 'spoiler'
    ? `||${node.getTextContent()}||`
    : null),
  importRegExp: /\|\|(.+?)\|\|/,
  regExp: /\|\|(.+?)\|\|$/,
  replace: NOOP as any,
  trigger: '|',
  type: 'text-match',
}

export const MENTION_TRANSFORMER: TextMatchTransformer = {
  dependencies: [],
  export: (node) => {
    if (node.getType() !== 'mention')
      return null
    const j = data(node)
    const base = `{${j.platform}@${j.handle}}`
    return j.displayName
      ? `[${j.displayName}]${base}`
      : base
  },
  importRegExp: /(?:\[([^\]]+)\])?\{(\w+)@(\w[\w.-]*)\}/,
  regExp: /(?:\[([^\]]+)\])?\{(\w+)@(\w[\w.-]*)\}$/,
  replace: NOOP as any,
  trigger: '}',
  type: 'text-match',
}

export const FOOTNOTE_TRANSFORMER: TextMatchTransformer = {
  dependencies: [],
  export: node =>
    node.getType() === 'footnote'
      ? `[^${data(node).identifier ?? ''}]`
      : null,
  importRegExp: /\[\^(\w+)\]/,
  regExp: /\[\^(\w+)\]$/,
  replace: NOOP as any,
  trigger: ']',
  type: 'text-match',
}

export const KATEX_INLINE_TRANSFORMER: TextMatchTransformer = {
  dependencies: [],
  export: node =>
    node.getType() === 'katex-inline'
      ? `$${data(node).equation ?? ''}$`
      : null,
  importRegExp: /\$([^\n$]+)\$/,
  regExp: /\$([^\n$]+)\$$/,
  replace: NOOP as any,
  trigger: '$',
  type: 'text-match',
}

export const RUBY_TRANSFORMER: TextMatchTransformer = {
  dependencies: [],
  export: (node) => {
    if (node.getType() !== 'ruby')
      return null
    const base = escHtml(node.getTextContent())
    const reading = escHtml(node instanceof RubyNode
      ? node.getReading()
      : '')
    if (!reading)
      return base
    return `<ruby>${base}<rt>${reading}</rt></ruby>`
  },
  importRegExp: /<ruby>([^<]*)<rt>([^<]*)<\/rt>(?:<rp>[^<]*<\/rp>)*<\/ruby>/i,
  regExp: /<ruby>([^<]*)<rt>([^<]*)<\/rt>(?:<rp>[^<]*<\/rp>)*<\/ruby>$/i,
  replace: NOOP as any,
  trigger: '>',
  type: 'text-match',
}

// ── TextFormat ──

export const INSERT_TRANSFORMER: TextFormatTransformer = {
  format: ['underline'],
  tag: '++',
  type: 'text-format',
}

export const SUPERSCRIPT_TRANSFORMER: TextFormatTransformer = {
  format: ['superscript'],
  tag: '^',
  type: 'text-format',
}

export const SUBSCRIPT_TRANSFORMER: TextFormatTransformer = {
  format: ['subscript'],
  tag: '~',
  type: 'text-format',
}

export const TAG_TRANSFORMER: TextMatchTransformer = {
  dependencies: [],
  export: node => (node.getType() === 'tag'
    ? `<tag>${data(node).text ?? ''}</tag>`
    : null),
  importRegExp: /<tag>([^<]+)<\/tag>/,
  regExp: /<tag>([^<]+)<\/tag>$/,
  replace: NOOP as any,
  trigger: '>',
  type: 'text-match',
}

export const COMMENT_TRANSFORMER: TextMatchTransformer = {
  dependencies: [],
  export: node =>
    node.getType() === 'comment'
      ? `<!--${data(node).text ?? ''}-->`
      : null,
  importRegExp: /<!--([\s\S]*?)-->/,
  regExp: /<!--([\s\S]*?)-->$/,
  replace: NOOP as any,
  trigger: '>',
  type: 'text-match',
}

// ── Element (block) ──

export const FOOTNOTE_SECTION_TRANSFORMER: ElementTransformer = {
  dependencies: [],
  export: (node) => {
    if (node.getType() !== 'footnote-section')
      return null
    const defs = data(node).definitions ?? {}
    return Object.entries(defs)
      .map(([id, content]) => `[^${id}]: ${content}`)
      .join('\n')
  },
  regExp: NEVER,
  replace: NOOP,
  type: 'element',
}

export const CONTAINER_TRANSFORMER: ElementTransformer = {
  dependencies: [],
  export: (node) => {
    const t = node.getType()
    if (t === 'banner') {
      const type = data(node).bannerType ?? 'note'
      return `::: ${type}\n${node.getTextContent()}\n:::`
    }
    if (t === 'details') {
      const summary = node instanceof DetailsNode
        ? node.getSummary()
        : ''
      return `::: details{summary="${qA(summary)}"}\n${node.getTextContent()}\n:::`
    }
    return null
  },
  regExp: NEVER,
  replace: NOOP,
  type: 'element',
}

const ALERT_KEY: Record<string, string> = {
  note: 'NOTE',
  tip: 'TIP',
  important: 'IMPORTANT',
  warning: 'WARNING',
  caution: 'CAUTION',
}

export const GIT_ALERT_TRANSFORMER: ElementTransformer = {
  dependencies: [],
  export: (node) => {
    if (node.getType() !== 'alert-quote')
      return null
    const key = ALERT_KEY[data(node).alertType ?? 'note'] ?? 'NOTE'
    const lines = node.getTextContent().split('\n')
    return [
      `> [!${key}]`,
      ...lines.map(l => `> ${l}`),
    ].join('\n')
  },
  regExp: NEVER,
  replace: NOOP,
  type: 'element',
}

export const KATEX_BLOCK_TRANSFORMER: TextMatchTransformer = {
  dependencies: [],
  export: node =>
    node.getType() === 'katex-block'
      ? `$$${data(node).equation ?? ''}$$`
      : null,
  importRegExp: /\$\$([^$]+)\$\$/,
  regExp: /\$\$([^$]+)\$\$$/,
  replace: NOOP as any,
  trigger: '$',
  type: 'text-match',
}

export const IMAGE_BLOCK_TRANSFORMER: ElementTransformer = {
  dependencies: [],
  export: (node) => {
    if (node.getType() !== 'image')
      return null
    const j = data(node)
    const title = j.caption
      ? ` "${qA(j.caption)}"`
      : ''
    return `![${j.altText || ''}](${j.src}${title})`
  },
  regExp: NEVER,
  replace: NOOP,
  type: 'element',
}

export const VIDEO_BLOCK_TRANSFORMER: ElementTransformer = {
  dependencies: [],
  export: (node) => {
    if (node.getType() !== 'video')
      return null
    const j = data(node)
    const attrs = [`src="${qA(j.src)}"`]
    if (j.poster)
      attrs.push(`poster="${qA(j.poster)}"`)
    if (j.width)
      attrs.push(`width=${j.width}`)
    if (j.height)
      attrs.push(`height=${j.height}`)
    return `<video ${attrs.join(' ')} controls></video>`
  },
  regExp: NEVER,
  replace: NOOP,
  type: 'element',
}

export const CODE_BLOCK_NODE_TRANSFORMER: ElementTransformer = {
  dependencies: [],
  export: (node) => {
    if (node.getType() !== 'code-block')
      return null
    const j = data(node)
    const f = fence(j.code || '')
    return `${f}${j.language || ''}\n${j.code || ''}\n${f}`
  },
  regExp: NEVER,
  replace: NOOP,
  type: 'element',
}

// Handle legacy Lexical CodeNode (type 'code') directly by type check,
// bypassing $isCodeNode when multiple code implementations are bundled (class identity mismatch).
export const LEGACY_CODE_NODE_TRANSFORMER: ElementTransformer = {
  dependencies: [],
  export: (node) => {
    if (node.getType() !== 'code')
      return null
    const lang = (node as any).getLanguage?.() ?? ''
    const text = node.getTextContent()
    const f = fence(text)
    return `${f}${lang}\n${text}\n${f}`
  },
  regExp: NEVER,
  replace: NOOP,
  type: 'element',
}

export const LINK_CARD_BLOCK_TRANSFORMER: ElementTransformer = {
  dependencies: [],
  export: (node) => {
    if (node.getType() !== 'link-card')
      return null
    const j = data(node)
    return j.title
      ? `[${j.title}](${j.url})`
      : `<${j.url}>`
  },
  regExp: NEVER,
  replace: NOOP,
  type: 'element',
}

export const MERMAID_BLOCK_TRANSFORMER: ElementTransformer = {
  dependencies: [],
  export: (node) => {
    if (node.getType() !== 'mermaid')
      return null
    const d = data(node).diagram ?? ''
    const f = fence(d)
    return `${f}mermaid\n${d}\n${f}`
  },
  regExp: NEVER,
  replace: NOOP,
  type: 'element',
}

export const CHART_BLOCK_TRANSFORMER: ElementTransformer = {
  dependencies: [],
  export: (node) => {
    if (node.getType() !== 'chart')
      return null
    const spec = data(node).spec ?? ''
    const f = fence(spec)
    return `${f}chart\n${spec}\n${f}`
  },
  regExp: NEVER,
  replace: NOOP,
  type: 'element',
}

export const NESTED_DOC_BLOCK_TRANSFORMER: ElementTransformer = {
  dependencies: [],
  export: (node) => {
    if (node.getType() !== 'nested-doc')
      return null
    return `<nested-doc>\n${stateText(data(node).content)}\n</nested-doc>`
  },
  regExp: NEVER,
  replace: NOOP,
  type: 'element',
}

export const GRID_CONTAINER_BLOCK_TRANSFORMER: ElementTransformer = {
  dependencies: [],
  export: (node) => {
    if (node.getType() !== 'grid-container')
      return null
    const j = data(node)
    const cells = (j.cells ?? []).map((c: unknown) => `::: cell\n${stateText(c)}\n:::`).join('\n')
    return `::: grid{cols=${j.cols ?? 2} gap="${qA(typeof j.gap === 'number'
      ? `${j.gap}px`
      : String(j.gap ?? '16px'))}"}\n${cells}\n:::`
  },
  regExp: NEVER,
  replace: NOOP,
  type: 'element',
}

export const STEPS_BLOCK_TRANSFORMER: ElementTransformer = {
  dependencies: [],
  export: (node) => {
    if (node.getType() !== 'steps')
      return null
    const j = data(node)
    const steps = (j.steps ?? [])
      .map(
        (s: { title?: string, content?: unknown }) =>
          `::: step{title="${qA(String(s.title ?? ''))}"}\n${stateText(s.content)}\n:::`,
      )
      .join('\n')
    return `::: steps\n${steps}\n:::`
  },
  regExp: NEVER,
  replace: NOOP,
  type: 'element',
}

export const HORIZONTAL_RULE_BLOCK_TRANSFORMER: ElementTransformer = {
  dependencies: [],
  export: node => (node.getType() === 'horizontalrule'
    ? '---'
    : null),
  regExp: NEVER,
  replace: NOOP,
  type: 'element',
}

export const TABLE_BLOCK_TRANSFORMER: ElementTransformer = {
  dependencies: [],
  export: (node) => {
    if (!$isTableNode(node))
      return null
    const rows = node.getChildren().filter($isTableRowNode)
    if (rows.length === 0)
      return '|  |\n| --- |'
    const data = rows.map(row =>
      row
        .getChildren()
        .filter($isTableCellNode)
        .map(c => escCell(c.getTextContent())),
    )
    const hdr = data[0]
    const sep = hdr.map(() => '---')
    return [
      `| ${hdr.join(' | ')} |`,
      `| ${sep.join(' | ')} |`,
      ...data.slice(1).map(r => `| ${r.join(' | ')} |`),
    ].join('\n')
  },
  regExp: NEVER,
  replace: NOOP,
  type: 'element',
}

// ── Extension block transformers ──

export const CODE_SNIPPET_BLOCK_TRANSFORMER: ElementTransformer = {
  dependencies: [],
  export: (node) => {
    if (node.getType() !== 'code-snippet')
      return null
    const j = data(node)
    const body = (j.files ?? [])
      .map((f: any) => {
        const fc = fence(f.code || '')
        return [
          `::: file{name="${qA(f.filename || 'untitled')}" lang="${qA(f.language || '')}"}`,
          `${fc}${f.language || ''}`,
          f.code || '',
          fc,
          ':::',
        ].join('\n')
      })
      .join('\n')
    return `::: code-snippet\n${body}\n:::`
  },
  regExp: NEVER,
  replace: NOOP,
  type: 'element',
}

export const EMBED_BLOCK_TRANSFORMER: ElementTransformer = {
  dependencies: [],
  export: node => (node.getType() === 'embed'
    ? `<${data(node).url || ''}>`
    : null),
  regExp: NEVER,
  replace: NOOP,
  type: 'element',
}

export const GALLERY_BLOCK_TRANSFORMER: ElementTransformer = {
  dependencies: [],
  export: (node) => {
    if (node.getType() !== 'gallery')
      return null
    const imgs = data(node).images ?? []
    return imgs.map((i: any) => `![${i.alt || ''}](${i.src || ''})`).join('\n')
  },
  regExp: NEVER,
  replace: NOOP,
  type: 'element',
}

export const EXCALIDRAW_BLOCK_TRANSFORMER: ElementTransformer = {
  dependencies: [],
  export: node =>
    node.getType() === 'excalidraw'
      ? `<excalidraw>\n${data(node).snapshot || ''}\n</excalidraw>`
      : null,
  regExp: NEVER,
  replace: NOOP,
  type: 'element',
}

export const POLL_BLOCK_TRANSFORMER: ElementTransformer = {
  dependencies: [],
  export: (node) => {
    if (node.getType() !== 'poll')
      return null
    const j = data(node)
    const meta: Record<string, unknown> = {
      pollId: j.pollId,
      mode: j.mode,
    }
    if (j.closeAt)
      meta.closeAt = j.closeAt
    if (j.showResults)
      meta.showResults = j.showResults
    const optionLines = (j.options ?? []).map(
      (option: { id: string, label: string }) =>
        `- ${escHtml(option.label || '')} <!-- id=${option.id} -->`,
    )
    return [
      `<!--hakulex:poll ${JSON.stringify(meta)}-->`,
      `**${escHtml(j.question || '')}**`,
      '',
      ...optionLines,
      '<!--/hakulex:poll-->',
    ].join('\n')
  },
  regExp: NEVER,
  replace: NOOP,
  type: 'element',
}

interface ChatJSON {
  messages: Array<{ id: string, participantId: string, content: string }>
  participants: Array<{ id: string, kind: 'user' | 'agent', name?: string }>
  variant: 'user-agent' | 'user-user'
}

const UNKNOWN_CHAT_PARTICIPANT = { id: '__unknown__', kind: 'user' as const, name: 'Unknown' }

function chatParticipantName(p: { kind: string, name?: string }): string {
  if (p.name)
    return p.name
  return p.kind === 'agent'
    ? 'Assistant'
    : 'User'
}

export const CHAT_BLOCK_TRANSFORMER: ElementTransformer = {
  dependencies: [],
  export: (node) => {
    if (node.getType() !== 'chat')
      return null
    const j = data(node) as ChatJSON
    const lookup = new Map(j.participants.map(p => [p.id, p]))
    const lines: string[] = []
    j.messages.forEach((m, idx) => {
      const p = lookup.get(m.participantId) ?? UNKNOWN_CHAT_PARTICIPANT
      const name = chatParticipantName(p)
      const isUserBubble
        = j.variant === 'user-user' || (j.variant === 'user-agent' && p.kind === 'user')
      const block = isUserBubble
        ? m.content
            .split('\n')
            .map((line, i) => (i === 0
              ? `> **${name}:** ${line}`
              : `> ${line}`))
            .join('\n')
        : m.content
      if (idx > 0)
        lines.push('')
      lines.push(block)
    })
    return lines.join('\n')
  },
  regExp: NEVER,
  replace: NOOP,
  type: 'element',
}

// ── Aggregate ──

export const allHeadlessTransformers = [
  // Inline
  SPOILER_TRANSFORMER,
  MENTION_TRANSFORMER,
  FOOTNOTE_TRANSFORMER,
  INSERT_TRANSFORMER,
  SUPERSCRIPT_TRANSFORMER,
  SUBSCRIPT_TRANSFORMER,
  RUBY_TRANSFORMER,
  KATEX_INLINE_TRANSFORMER,
  TAG_TRANSFORMER,
  COMMENT_TRANSFORMER,
  // Block (specific first)
  FOOTNOTE_SECTION_TRANSFORMER,
  CONTAINER_TRANSFORMER,
  GIT_ALERT_TRANSFORMER,
  CHECK_LIST,
  KATEX_BLOCK_TRANSFORMER,
  IMAGE_BLOCK_TRANSFORMER,
  VIDEO_BLOCK_TRANSFORMER,
  CODE_BLOCK_NODE_TRANSFORMER,
  LEGACY_CODE_NODE_TRANSFORMER,
  LINK_CARD_BLOCK_TRANSFORMER,
  MERMAID_BLOCK_TRANSFORMER,
  CHART_BLOCK_TRANSFORMER,
  NESTED_DOC_BLOCK_TRANSFORMER,
  GRID_CONTAINER_BLOCK_TRANSFORMER,
  STEPS_BLOCK_TRANSFORMER,
  HORIZONTAL_RULE_BLOCK_TRANSFORMER,
  TABLE_BLOCK_TRANSFORMER,
  CODE_SNIPPET_BLOCK_TRANSFORMER,
  EMBED_BLOCK_TRANSFORMER,
  GALLERY_BLOCK_TRANSFORMER,
  EXCALIDRAW_BLOCK_TRANSFORMER,
  POLL_BLOCK_TRANSFORMER,
  CHAT_BLOCK_TRANSFORMER,
  // Standard (heading, quote, list, code, bold, italic, strikethrough, link…)
  ...TRANSFORMERS,
]

/** The document as Markdown. Call it inside `editor.read()`. */
export function $toMarkdown(): string {
  return $convertToMarkdownString(allHeadlessTransformers)
}
