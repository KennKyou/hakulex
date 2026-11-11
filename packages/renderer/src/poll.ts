import type { SerializedDocument, SerializedNode } from './types'
import { nestedRoots } from './steps'
import { toRenderableTree } from './unknown'

export type PollMode = 'single' | 'multiple'
export type PollShowResults = 'always' | 'after-vote' | 'after-close'

export interface PollOption {
  id: string
  label: string
}

/** A poll as a backend needs it: what `extractPolls` returns. */
export interface PollMetadata {
  pollId: string
  question: string
  options: PollOption[]
  mode: PollMode
  /** ISO 8601. Shown only: whether voting is closed is the backend's call. */
  closeAt?: string
  showResults?: PollShowResults
}

/** A poll ready to show. Stored content is untrusted: what isn't valid is left out. */
export interface PollProps extends Omit<PollMetadata, 'pollId'> {
  /** Without one, nobody can vote on it. */
  pollId?: string
}

const SHOW_RESULTS: readonly string[] = ['always', 'after-vote', 'after-close']
function text(value: unknown) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : undefined
}
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function isDate(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Date.parse(value))
}

/** `null` when there is nothing to show. */
export function normalizePoll(node: Record<string, unknown>): PollProps | null {
  const options = Array.isArray(node.options)
    ? node.options.filter(isObject).flatMap((option) => {
        const id = text(option.id)
        const label = text(option.label)
        return id && label
          ? [
              { id, label },
            ]
          : []
      })
    : []
  const question = text(node.question) ?? ''
  if (!question && !options.length)
    return null
  return {
    question,
    options,
    mode: node.mode === 'multiple'
      ? 'multiple'
      : 'single',
    ...(text(node.pollId)
      ? {
          pollId: text(node.pollId),
        }
      : {}),
    ...(isDate(node.closeAt)
      ? { closeAt: node.closeAt }
      : {}),
    ...(typeof node.showResults === 'string' && SHOW_RESULTS.includes(node.showResults)
      ? { showResults: node.showResults as PollShowResults }
      : {}),
  }
}

/**
 * The polls a document holds, nested content included, each once: for a server
 * to load their state before rendering. Polls nobody can vote on are left out.
 */
export function extractPolls(doc: SerializedDocument): PollMetadata[] {
  const found = new Map<string, PollMetadata>()
  const walk = (node: SerializedNode) => {
    if (node.type === 'poll') {
      const poll = normalizePoll(node)
      if (poll?.pollId && poll.options.length && !found.has(poll.pollId))
        found.set(poll.pollId, poll as PollMetadata)
    }
    node.children?.forEach(walk)
    nestedRoots(node).forEach(walk)
  }
  if (isObject(doc?.root))
    walk(toRenderableTree(doc.root))
  return [
    ...found.values(),
  ]
}

/** Same text on server and client, whatever their time zones. */
export function formatCloseAt(closeAt: string): string {
  return `${new Date(closeAt).toISOString().slice(0, 16).replace('T', ' ')} UTC`
}
