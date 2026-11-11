import type { SlashMenuItem } from './types'

/**
 * Filters by query against key, title and keywords (case-insensitive).
 * Items whose title or key starts with the query rank first; order is otherwise kept.
 */
export function filterItems(items: readonly SlashMenuItem[], query: string): SlashMenuItem[] {
  const q = query.trim().toLowerCase()
  if (!q)
    return [...items]

  const prefix: SlashMenuItem[] = []
  const contains: SlashMenuItem[] = []
  for (const item of items) {
    const title = item.title.toLowerCase()
    const key = item.key.toLowerCase()
    if (title.startsWith(q) || key.startsWith(q)) {
      prefix.push(item)
    }
    else if ([
      title,
      key,
      ...(item.keywords ?? []).map(k => k.toLowerCase()),
    ].some(text => text.includes(q))) {
      contains.push(item)
    }
  }
  return [
    ...prefix,
    ...contains,
  ]
}
