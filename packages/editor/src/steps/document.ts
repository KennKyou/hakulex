import { createEmptyContent } from '../nested/content'

/** A step as stored, plus what it takes to use it. Fields we don't know about stay in `raw`. */
export interface StoredStep {
  raw: Record<string, unknown>
  id: string
  title: string
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

export function createStepId(): string {
  let id = 's_'
  for (let i = 0; i < 8; i++)
    id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)]
  return id
}

/** Reads stored steps. Stored content is untrusted, so what isn't a step is dropped. */
export function normalizeStoredSteps(value: unknown): StoredStep[] {
  if (!Array.isArray(value))
    return []
  return value.filter(isObject).map(raw => ({
    raw,
    id: typeof raw.id === 'string' && raw.id
      ? raw.id
      : createStepId(),
    title: typeof raw.title === 'string'
      ? raw.title
      : '',
  }))
}

export function createBlankStep(): StoredStep {
  return {
    raw: {
      content: createEmptyContent(),
    },
    id: createStepId(),
    title: '',
  }
}
