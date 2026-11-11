import type { EditorState, NodeKey } from 'lexical'
import type { FootnoteNode, FootnoteSectionNode } from '../nodes/FootnoteNodes'
import type { FootnoteState } from './state'
import { $dfs } from '@lexical/utils'
import { $addUpdateTag, $createParagraphNode, $getNodeByKey, $getRoot, HISTORY_PUSH_TAG } from 'lexical'
import { $createFootnoteSectionNode, $isFootnoteNode, $isFootnoteSectionNode } from '../nodes/FootnoteNodes'

export interface FootnoteScan {
  references: FootnoteNode[]
  sections: FootnoteSectionNode[]
}

/** Every reference and section, in document order. */
export function $scanFootnotes(): FootnoteScan {
  const scan: FootnoteScan = { references: [], sections: [] }
  for (const { node } of $dfs()) {
    if ($isFootnoteNode(node) && node.getIdentifier())
      scan.references.push(node)
    else if ($isFootnoteSectionNode(node))
      scan.sections.push(node)
  }
  return scan
}

export function $footnoteState({ references, sections }: FootnoteScan): FootnoteState {
  const state: FootnoteState = {
    numbers: new Map(),
    firstKeys: new Map(),
    definitions: new Map(),
  }
  for (const node of references) {
    const identifier = node.getIdentifier()
    if (!state.numbers.has(identifier)) {
      state.numbers.set(identifier, state.numbers.size + 1)
      state.firstKeys.set(identifier, node.getKey())
    }
  }
  for (const section of sections) {
    for (const [identifier, content] of Object.entries(section.getDefinitions())) {
      // Earlier sections win, but blank content has nothing to win with.
      if (!state.definitions.get(identifier)?.trim())
        state.definitions.set(identifier, content)
    }
  }
  return state
}

const sameMap = <V>(a: Map<string, V>, b: Map<string, V>) => a.size === b.size && [...a].every(([key, value]) => b.get(key) === value)

/** So that an update which changed nothing here, as most do, renders nothing either. */
export function sameFootnoteState(a: FootnoteState, b: FootnoteState) {
  return sameMap(a.numbers, b.numbers) && sameMap(a.firstKeys, b.firstKeys) && sameMap(a.definitions, b.definitions)
}

/** Content stays on one line, however it got here. */
export const normalizeFootnoteContent = (content: string) => content.replace(/\s*\n\s*/g, ' ').trim()

function sameDefinitions(a: Record<string, string>, b: Record<string, string>) {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && a[key] === b[key])
}

/**
 * Whether the section has to end up last: it was already, or it's new. A section
 * stored in the middle of a document stays there.
 */
export function $sectionBelongsLast({ sections: [section] }: FootnoteScan, previous: EditorState): boolean {
  if (!section)
    return false
  const key = section.getKey()
  return !previous._nodeMap.has(key) || previous.read(() => $getRoot().getLastChild()?.getKey() === key)
}

/**
 * One section holding a note for every reference. Content with text stays when
 * its reference goes away: that is also what cutting and pasting a paragraph
 * looks like. Blank content has nothing to lose, so it goes.
 */
export function $reconcileFootnotes(scan: FootnoteScan, belongsLast: boolean) {
  const state = $footnoteState(scan)
  const entries: [string, string][] = []
  for (const [identifier, content] of state.definitions) {
    if (content.trim() || state.numbers.has(identifier))
      entries.push([identifier, content])
  }
  for (const identifier of state.numbers.keys()) {
    if (!state.definitions.has(identifier))
      entries.push([identifier, ''])
  }
  const definitions = Object.fromEntries(entries)

  const [section, ...others] = scan.sections
  for (const other of others)
    other.remove()

  const root = $getRoot()
  if (!entries.length) {
    section?.remove()
    // The section may have been all there was.
    if (root.isEmpty())
      root.append($createParagraphNode())
    return
  }
  if (!section) {
    root.append($createFootnoteSectionNode(definitions))
    return
  }
  if (!sameDefinitions(section.getDefinitions(), definitions))
    section.setDefinitions(definitions)
  if ((belongsLast || others.length) && !section.is(root.getLastChild()))
    root.append(section)
}

/** Whether `$reconcileFootnotes` would change anything. */
export function needsFootnoteReconcile(scan: FootnoteScan, belongsLast: boolean): boolean {
  const state = $footnoteState(scan)
  const [section, ...others] = scan.sections
  if (others.length)
    return true
  if (!section)
    return state.numbers.size > 0
  if (belongsLast && !section.is($getRoot().getLastChild()))
    return true
  const definitions = section.getDefinitions()
  const keys = Object.keys(definitions)
  if (!keys.length)
    return true
  if ([
    ...state.numbers.keys(),
  ].some(identifier => !Object.hasOwn(definitions, identifier))) {
    return true
  }
  return keys.some(identifier => !definitions[identifier].trim() && !state.numbers.has(identifier))
}

export function $setFootnoteContent(sectionKey: NodeKey, identifier: string, content: string) {
  const section = $getNodeByKey(sectionKey)
  if (!$isFootnoteSectionNode(section))
    return
  const value = normalizeFootnoteContent(content)
  const definitions = section.getDefinitions()
  if (definitions[identifier] === value)
    return
  $addUpdateTag(HISTORY_PUSH_TAG)
  section.setDefinitions({ ...definitions, [identifier]: value })
}

/** Removes a note with every reference to it. Leaving them would only bring it back empty. */
export function $removeFootnote(sectionKey: NodeKey, identifier: string) {
  const section = $getNodeByKey(sectionKey)
  if (!$isFootnoteSectionNode(section))
    return
  $addUpdateTag(HISTORY_PUSH_TAG)
  for (const node of $scanFootnotes().references) {
    if (node.getIdentifier() === identifier)
      node.remove()
  }
  const { [identifier]: _removed, ...rest } = section.getDefinitions()
  section.setDefinitions(rest)
}

/** The smallest number no reference or content uses. */
export function nextFootnoteIdentifier(state: FootnoteState): string {
  let next = 1
  while (state.numbers.has(String(next)) || state.definitions.has(String(next)))
    next++
  return String(next)
}

/** Back to just after a reference, where the author was. */
export function $selectAfterFootnote(refKey: NodeKey | undefined) {
  const node = refKey
    ? $getNodeByKey(refKey)
    : null
  if (node)
    node.selectNext(0, 0)
}
