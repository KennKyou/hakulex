import MarkdownIt from 'markdown-it'
import { isSafeImageSrc } from './image/src'
import { validateUrl } from './url'

export type ChatVariant = 'user-agent' | 'user-user'

export interface ChatParticipantData {
  id: string
  kind: 'user' | 'agent'
  name?: string
  avatar?: string
}

export interface ChatMessageData {
  id: string
  participantId: string
  content: string
}

export interface ChatData {
  variant: ChatVariant
  participants: ChatParticipantData[]
  messages: ChatMessageData[]
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** What a stored chat shows. Stored content is untrusted: what isn't valid is left out. */
export function normalizeChat(node: Record<string, unknown>): ChatData {
  return {
    variant: node.variant === 'user-user'
      ? 'user-user'
      : 'user-agent',
    participants: Array.isArray(node.participants)
      ? node.participants.filter(isObject).flatMap(({ id, kind, name, avatar }) => (typeof id === 'string'
          ? [
              {
                id,
                kind: kind === 'agent'
                  ? 'agent' as const
                  : 'user' as const,
                name: typeof name === 'string' && name.trim()
                  ? name
                  : undefined,
                avatar: isSafeImageSrc(avatar)
                  ? avatar
                  : undefined,
              },
            ]
          : []))
      : [],
    messages: Array.isArray(node.messages)
      ? node.messages.filter(isObject).flatMap(({ id, participantId, content }, index) => (typeof participantId === 'string' && typeof content === 'string'
          ? [
              {
                id: typeof id === 'string'
                  ? id
                  : String(index),
                participantId,
                content,
              },
            ]
          : []))
      : [],
  }
}

export function chatParticipantName(participant: Pick<ChatParticipantData, 'kind' | 'name'> | undefined): string {
  if (!participant)
    return '未知'
  return participant.name ?? (participant.kind === 'agent'
    ? '助理'
    : '使用者')
}

/** Addresses a message may use. No `data:`: that needs telling links and images apart, and nobody writes those by hand. */
function isAllowedInMessage(url: string): boolean {
  return validateUrl(url) || (isSafeImageSrc(url) && !/^data:/i.test(url))
}

// Messages are stored content and this output goes in as HTML, so `html` must stay false.
const markdown = new MarkdownIt({ html: false, breaks: true, linkify: false })
markdown.validateLink = isAllowedInMessage

const renderToken: NonNullable<typeof markdown.renderer.rules.link_open> = (tokens, index, options, _env, self) => self.renderToken(tokens, index, options)
markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index].attrSet('rel', 'noopener noreferrer')
  tokens[index].attrSet('target', '_blank')
  return renderToken(tokens, index, options, env, self)
}
const renderImage = markdown.renderer.rules.image!
markdown.renderer.rules.image = (tokens, index, options, env, self) => {
  tokens[index].attrSet('loading', 'lazy')
  return renderImage(tokens, index, options, env, self)
}

/** A message as HTML that is safe to put on the page: anything written as HTML comes out as text. */
export function renderChatMarkdown(content: unknown): string {
  return typeof content === 'string'
    ? markdown.render(content)
    : ''
}
