// @vitest-environment node
import type { Json } from './fixtures'
import { createHeadlessEditor } from '@lexical/headless'
import { describe, expect, it } from 'vitest'
import { allHeadlessNodes, sanitizeSerializedJSON, sanitizeSerializedState } from '../src'
import { doc, paragraph, text } from './fixtures'

/* Taking out nodes a server doesn't know, so it can still read the document. */

function parse(state: Json) {
  return createHeadlessEditor({
    nodes: allHeadlessNodes,
    onError: (error) => { throw error },
  }).parseEditorState(JSON.stringify(state))
}

function withUnknown() {
  return doc(
    { type: 'future-block', version: 1, value: 1 },
    paragraph(
      text('前'),
      {
        type: 'future-inline',
        version: 1,
        children: [
          text('裡面'),
        ],
      },
      { type: 'linebreak', version: 1 },
      {
        type: 'tab',
        version: 1,
        detail: 2,
        format: 0,
        mode: 'normal',
        style: '',
        text: '\t',
      },
      {
        type: 'future-inline',
        version: 1,
        children: [
          text('又一個'),
        ],
      },
    ),
    { type: 'future-block', version: 1, value: 2 },
  )
}

describe('sanitizeSerializedState', () => {
  it('drops unknown leaves, keeps the children of unknown elements, and reports each type once', () => {
    const state = withUnknown()
    const before = structuredClone(state)
    const seen: string[] = []
    const out = sanitizeSerializedState(state, {
      nodes: allHeadlessNodes,
      onUnknown: type => seen.push(type),
    })

    expect(out).toEqual(doc(paragraph(
      text('前'),
      text('裡面'),
      { type: 'linebreak', version: 1 },
      {
        type: 'tab',
        version: 1,
        detail: 2,
        format: 0,
        mode: 'normal',
        style: '',
        text: '\t',
      },
      text('又一個'),
    )))
    expect(seen).toEqual(['future-block', 'future-inline'])
    expect(state).toEqual(before)
  })

  it('makes a document that couldn\'t be read readable', () => {
    const state = withUnknown()
    expect(() => parse(state)).toThrow()
    expect(() => parse(sanitizeSerializedState(state, { nodes: allHeadlessNodes }))).not.toThrow()
  })

  it('knows the rich quote', () => {
    const seen: string[] = []
    sanitizeSerializedState(doc({
      type: 'rich-quote',
      version: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      attribution: 'Lu Xun',
      children: [
        paragraph(text('Hello quote')),
      ],
    }), {
      nodes: allHeadlessNodes,
      onUnknown: type => seen.push(type),
    })
    expect(seen).toEqual([])
  })
})

describe('sanitizeSerializedJSON', () => {
  it('gives back the sanitized document as JSON', () => {
    const out = sanitizeSerializedJSON(JSON.stringify(withUnknown()), { nodes: allHeadlessNodes })
    expect(JSON.parse(out).root.children.map((node: Json) => node.type)).toEqual(['paragraph'])
  })

  it('gives back a string that isn\'t JSON as it was', () => {
    expect(sanitizeSerializedJSON('{not json', { nodes: allHeadlessNodes })).toBe('{not json')
    expect(sanitizeSerializedJSON('42', { nodes: allHeadlessNodes })).toBe('42')
  })
})
