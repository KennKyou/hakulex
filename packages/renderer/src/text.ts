import type { VNodeChild } from 'vue'
import type { SerializedNode } from './types'
import { contentTheme } from '@hakulex/style-token'
import { h } from 'vue'

// Lexical's TextNode format bits.
const FORMAT = {
  bold: 1,
  italic: 1 << 1,
  strikethrough: 1 << 2,
  underline: 1 << 3,
  code: 1 << 4,
  subscript: 1 << 5,
  superscript: 1 << 6,
  highlight: 1 << 7,
} as const

type Format = keyof typeof FORMAT

function textClasses(format: number): string[] {
  const has = (name: Format) => (format & FORMAT[name]) !== 0
  const classes: string[] = []
  const underlineStrike = has('underline') && has('strikethrough')
  if (underlineStrike)
    classes.push(contentTheme.text.underlineStrikethrough)
  for (const name of Object.keys(FORMAT) as Format[]) {
    if (!has(name))
      continue
    if (underlineStrike && (name === 'underline' || name === 'strikethrough'))
      continue
    classes.push(contentTheme.text[name])
  }
  return classes
}

/**
 * Mirrors Lexical's TextNode DOM: an optional outer tag (code / mark / sub / sup)
 * around an inner strong / em / span that carries the format classes.
 */
export function renderText(node: SerializedNode): VNodeChild {
  const text = typeof node.text === 'string'
    ? node.text
    : ''
  const format = typeof node.format === 'number'
    ? node.format
    : 0
  const style = typeof node.style === 'string' && node.style
    ? node.style
    : undefined
  const has = (name: Format) => (format & FORMAT[name]) !== 0

  const outer = has('code')
    ? 'code'
    : has('highlight')
      ? 'mark'
      : has('subscript')
        ? 'sub'
        : has('superscript')
          ? 'sup'
          : null
  const inner = has('bold')
    ? 'strong'
    : has('italic')
      ? 'em'
      : 'span'
  const classes = textClasses(format)

  // Plain text needs no wrapper.
  if (!outer && inner === 'span' && classes.length === 0 && !style)
    return text

  // Style goes on the outermost element; attributes are only set when present
  // (Vue SSR prints `style=""` for an undefined style).
  const styleAttr = style
    ? { style }
    : {}
  const innerNode = h(inner, {
    class: classes.length ? classes : undefined,
    ...(outer
      ? {}
      : styleAttr),
  }, text)
  return outer
    ? h(outer, styleAttr, [innerNode])
    : innerNode
}
