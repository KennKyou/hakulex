import type { NestedContent } from '../nested/content'
import type { StoredStep } from './document'
import { createNestedContent, editedContent, nestedText } from '../nested/content'

/** One step. Immutable: an edit to the title makes a new one around the same editor. */
export interface StepEntry extends NestedContent {
  /** Tells steps apart on the page: stored ids can repeat. */
  uid: number
  id: string
  title: string
  raw: Record<string, unknown>
}

let nextUid = 1

export function createStepEntry(parent: Parameters<typeof createNestedContent>[0], step: StoredStep): StepEntry {
  return {
    ...createNestedContent(parent, step.raw.content),
    uid: nextUid++,
    id: step.id,
    title: step.title,
    raw: step.raw,
  }
}

/** The step to store. Lexical would tidy content up, so unedited content is what was loaded. */
export function stepToJSON(entry: StepEntry): Record<string, unknown> {
  const edited = editedContent(entry)
  const { content: _stored, ...rest } = entry.raw
  return {
    ...rest,
    id: entry.id,
    title: entry.title,
    ...(edited !== undefined
      ? { content: edited }
      : 'content' in entry.raw
        ? { content: entry.raw.content }
        : {}),
  }
}

export const stepText = (entry: StepEntry) => nestedText(entry.editor)
