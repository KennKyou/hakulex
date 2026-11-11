import type { TextNode } from 'lexical'
import { MENTION_PLATFORMS } from '@hakulex/renderer'
import { $getSelection, $isRangeSelection, $isTextNode } from 'lexical'

/** An `@query` right before the caret. */
export interface MentionTrigger {
  nodeKey: string
  /** Caret offset in the text node; the match ends here. */
  end: number
  /** Length of `@` plus the query. */
  length: number
  query: string
}

const MAX_QUERY_LENGTH = 64

// `@` or the full-width `＠` CJK input methods produce, at line start or after whitespace,
// which keeps `a@b.com` as text.
const TRIGGER_RE = new RegExp(`(?:^|\\s)[@＠]([^\\s@＠]{0,${MAX_QUERY_LENGTH}})$`)

export function matchMentionTrigger(textBeforeCaret: string): { query: string, length: number } | null {
  const match = TRIGGER_RE.exec(textBeforeCaret)
  return match
    ? { query: match[1], length: match[1].length + 1 }
    : null
}

/** Reads the trigger under a collapsed caret in a plain text node, if any. */
export function $getMentionTrigger(): MentionTrigger | null {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed() || selection.anchor.type !== 'text')
    return null
  const node = selection.anchor.getNode()
  if (!$isTextNode(node) || !node.isSimpleText() || node.hasFormat('code'))
    return null
  const end = selection.anchor.offset
  const match = matchMentionTrigger(node.getTextContent().slice(0, end))
  return match
    ? {
        nodeKey: node.getKey(),
        end,
        ...match,
      }
    : null
}

export interface MentionMenuItem {
  key: string
  platform: string
  /** The account this makes a mention of. Without one, picking it asks for the account. */
  handle?: string
  title: string
  description: string
}

const platformKeys = Object.keys(MENTION_PLATFORMS)
const label = (platform: string) => MENTION_PLATFORMS[platform].label

/** The platform a query names before its `:`, or `null` when it names one we don't have. */
function platformOf(prefix: string): string | null {
  const platform = prefix.toUpperCase()
  return Object.hasOwn(MENTION_PLATFORMS, platform)
    ? platform
    : null
}

/** What to offer for a query: `` lists platforms, `name` and `GH:name` make mentions. */
export function mentionMenuItems(query: string): MentionMenuItem[] {
  if (!query) {
    return platformKeys.map(platform => ({
      key: platform,
      platform,
      title: label(platform),
      description: `@${platform}:`,
    }))
  }
  const colon = query.indexOf(':')
  if (colon === -1) {
    return platformKeys.map(platform => ({
      key: platform,
      platform,
      handle: query,
      title: label(platform),
      description: `@${query}`,
    }))
  }
  const platform = platformOf(query.slice(0, colon))
  const handle = query.slice(colon + 1)
  return platform && handle
    ? [
        {
          key: platform,
          platform,
          handle,
          title: label(platform),
          description: `@${handle}`,
        },
      ]
    : []
}

/** `@GH:` with no account yet: nothing to pick, but the menu says what comes next. */
export function isWaitingForHandle(query: string): boolean {
  return query.endsWith(':') && query.indexOf(':') === query.length - 1 && platformOf(query.slice(0, -1)) !== null
}

/** The text node holding just the trigger, split from what's around it. */
export function $splitTrigger(node: TextNode, trigger: MentionTrigger): TextNode {
  const start = trigger.end - trigger.length
  const parts = node.splitText(start, trigger.end)
  return start === 0
    ? parts[0]
    : parts[1]
}
