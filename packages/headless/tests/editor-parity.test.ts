import type { Json } from './fixtures'
import { $prepareStoredNodes, builtinNodes as editorNodes, serializeEditorState } from '@hakulex/editor'
import { createHeadlessEditor } from '@lexical/headless'
import { $getRoot, $parseSerializedNode, createEditor } from 'lexical'
import { describe, expect, it } from 'vitest'
import { allHeadlessNodes } from '../src'
import { everyNode, onlyInHeadless } from './fixtures'

/*
 * The headless nodes are written apart from the editor's, so they could drift: these compare the
 * two. When the editor gains a kind of node or a field, they fail until the headless side has it.
 */

function typeOf(node: unknown) {
  return (typeof node === 'function'
    ? node
    : (node as { replace: { getType: () => string } }).replace).getType()
}

describe('the same as the editor', () => {
  it('knows the same kinds of node, plus excalidraw and the old code node with its highlights', () => {
    // The two wrappers the editor keeps unknown nodes in are its own, not a kind of stored node.
    const wrappers = ['hlx-unknown-block', 'hlx-unknown-inline']
    const editorTypes = editorNodes.map(typeOf).filter(type => !wrappers.includes(type))
    expect(editorNodes.length - editorTypes.length).toBe(2)
    // The old code node holds its highlighted text in code-highlight nodes.
    expect(allHeadlessNodes.map(typeOf).sort()).toEqual([
      ...editorTypes,
      ...onlyInHeadless,
      'code-highlight',
    ].sort())
  })

  it('gives back the same document as the editor', () => {
    const state: Json = {
      root: {
        ...everyNode.root,
        children: everyNode.root.children.filter(node => !onlyInHeadless.includes(node.type)),
      },
    }
    const json = JSON.stringify(state)

    // As the editor loads a stored document: alerts and banners keep their blocks in `content`.
    const editor = createEditor({
      nodes: editorNodes,
      onError: (error) => { throw error },
    })
    editor.update(() => {
      $getRoot().clear().append(...$prepareStoredNodes(state.root.children).map(node => $parseSerializedNode(node)))
    }, { discrete: true })
    const fromEditor = JSON.parse(JSON.stringify(serializeEditorState(editor.getEditorState())))

    const headless = createHeadlessEditor({
      nodes: allHeadlessNodes,
      onError: (error) => { throw error },
    })
    const fromHeadless = JSON.parse(JSON.stringify(headless.parseEditorState(json).toJSON()))

    expect(fromEditor).toEqual(state)
    expect(fromHeadless).toEqual(fromEditor)
  })
})
