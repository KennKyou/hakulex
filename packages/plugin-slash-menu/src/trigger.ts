import type { TextNode } from 'lexical'
import { $getSelection, $isRangeSelection, $isTextNode } from 'lexical'

/** A `/query` right before the caret. */
export interface TriggerMatch {
  nodeKey: string
  /** Caret offset in the text node; the match ends here. */
  end: number
  /** Length of `/` plus the query. */
  length: number
  query: string
}

const MAX_QUERY_LENGTH = 32

// `/` or the full-width `／` CJK input methods produce, at line start or after
// whitespace, followed by a query without spaces or further slashes.
const TRIGGER_RE = new RegExp(`(?:^|\\s)([/／])([^\\s/／]{0,${MAX_QUERY_LENGTH}})$`)

/** Matches a trigger at the end of `textBeforeCaret`. */
export function matchTrigger(textBeforeCaret: string): { query: string, length: number } | null {
  const match = TRIGGER_RE.exec(textBeforeCaret)
  if (!match)
    return null
  const [, slash, query] = match
  return { query, length: slash.length + query.length }
}

/** Reads the trigger under a collapsed caret in a plain text node, if any. */
export function $getTriggerMatch(): TriggerMatch | null {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed() || selection.anchor.type !== 'text')
    return null
  const node = selection.anchor.getNode()
  if (!$isTextNode(node) || !node.isSimpleText() || node.hasFormat('code'))
    return null

  const end = selection.anchor.offset
  const match = matchTrigger(node.getTextContent().slice(0, end))
  return match
    ? {
        nodeKey: node.getKey(),
        end,
        ...match,
      }
    : null
}

/** Removes the `/query` text, leaving the caret where it started. */
export function $removeTrigger(node: TextNode, match: TriggerMatch): void {
  node.spliceText(match.end - match.length, match.length, '', true)
}
