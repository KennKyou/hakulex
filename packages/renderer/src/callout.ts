import type { SerializedNode } from './types'

export const CALLOUT_TYPES = [
  'note',
  'tip',
  'important',
  'warning',
  'caution',
] as const
export type CalloutType = (typeof CALLOUT_TYPES)[number]

export const CALLOUT_LABELS: Record<CalloutType, string> = {
  note: '備註',
  tip: '提示',
  important: '重要',
  warning: '警告',
  caution: '注意',
}

const ALIASES: Record<string, CalloutType> = {
  info: 'note',
  success: 'tip',
  warn: 'warning',
  error: 'caution',
  danger: 'caution',
}

/** A known type or one of the Markdown aliases, case-insensitively; otherwise `null`. */
export function normalizeCalloutType(type: unknown): CalloutType | null {
  if (typeof type !== 'string')
    return null
  const name = type.toLowerCase()
  if (CALLOUT_TYPES.includes(name as CalloutType))
    return name as CalloutType
  return Object.hasOwn(ALIASES, name)
    ? ALIASES[name]
    : null
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** The blocks that store their content as a whole document, in `content`. */
const hasContentDocument = (node: SerializedNode) => node.type === 'alert-quote' || node.type === 'banner'

/**
 * A stored alert or banner with its content as `children`, which is how the
 * editor holds it and how the renderer walks it. The fields of the content's root
 * go on the block, so `calloutWithContent` can put them back. `content` wins, and
 * one that isn't a document is dropped: a block with `children` keeps them.
 */
export function calloutWithChildren<T extends SerializedNode>(node: T): T {
  if (!hasContentDocument(node) || !('content' in node))
    return node
  const { content, ...rest } = node
  const root = isObject(content) && isObject(content.root) && Array.isArray(content.root.children)
    ? content.root
    : null
  return (root
    ? {
        ...rest,
        direction: root.direction,
        format: root.format,
        indent: root.indent,
        children: root.children,
      }
    : rest) as unknown as T
}

/** The stored form of a block read with `calloutWithChildren`. Other nodes are returned as they are. */
export function calloutWithContent<T extends SerializedNode>(node: T): T {
  if (!hasContentDocument(node) || !Array.isArray(node.children))
    return node
  const { children, direction, format, indent, ...rest } = node
  return {
    ...rest,
    content: {
      root: {
        children,
        direction,
        format,
        indent,
        type: 'root',
        version: 1,
      },
    },
  } as unknown as T
}
