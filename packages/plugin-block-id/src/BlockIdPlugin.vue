<script setup lang="ts">
import type { LexicalEditor, LexicalNode, NodeKey } from 'lexical'
import { useLexicalRegister } from '@hakulex/vue-lexical'
import { $getNodeByKey, $getRoot, $getState, $isElementNode, $setState, HISTORY_MERGE_TAG, RootNode } from 'lexical'
import { blockIdState, createBlockId } from './block-id'

/*
 * Gives every top-level block an ID that stays with it. A block made by an edit gets its ID
 * within that same edit, so the document never goes out with a block that has none, and one
 * undo takes back both. A document that arrives without IDs gets them without counting as a
 * change. Nothing is written while the editor is read-only.
 */

interface Seen { key: NodeKey, id: string }

function $numberBlocks(before: Seen[]) {
  const children = $getRoot().getChildren()
  const here = new Set(children.map(child => child.getKey()))
  const hadId = new Map(before.map(({ key, id }) => [key, id]))
  const placeBefore = new Map(before.map(({ key }, index) => [key, index]))

  // Of several blocks with one ID, the one that had it before keeps it; failing that, the first.
  const keeper = new Map<string, NodeKey>()
  for (const child of children) {
    const id = $getState(child, blockIdState)
    if (!id)
      continue
    const known = hadId.get(child.getKey()) === id
    if (!keeper.has(id) || (known && hadId.get(keeper.get(id)!) !== id))
      keeper.set(id, child.getKey())
  }

  const used = new Set(keeper.keys())
  // The place in `before` of the last block met that was already there.
  let last = -1
  for (const child of children) {
    const key = child.getKey()
    const id = $getState(child, blockIdState)
    if (id && keeper.get(id) === key) {
      last = placeBefore.get(key) ?? last
      continue
    }
    // A block that stands where one has just gone takes over its ID: a paragraph turned
    // into a heading is still that block.
    const gone = before[last + 1]
    let next: string
    if (gone && gone.id && !here.has(gone.key) && !used.has(gone.id)) {
      next = gone.id
      last += 1
    }
    else {
      do next = createBlockId()
      while (used.has(next))
    }
    used.add(next)
    $setState(child, blockIdState, next)
  }
}

/**
 * Whether the document being written shares nothing with the one on the page: it was set whole
 * (loaded from outside), not edited into. Asked from inside an update, where the editor's own
 * state is still the one from before.
 */
function $arrivedWhole(editor: LexicalEditor): boolean {
  const keys = editor.getEditorState().read(() => {
    const found: NodeKey[] = []
    const walk = (node: LexicalNode) => {
      found.push(node.getKey())
      if ($isElementNode(node))
        node.getChildren().forEach(walk)
    }
    $getRoot().getChildren().forEach(walk)
    return found
  })
  return keys.every(key => $getNodeByKey(key) === null)
}

function read(editor: LexicalEditor): Seen[] {
  return editor.getEditorState().read(() => $getRoot().getChildren().map(child => ({
    key: child.getKey(),
    id: $getState(child, blockIdState),
  })))
}

function incomplete(blocks: Seen[]) {
  return blocks.some(({ id }) => !id) || new Set(blocks.map(({ id }) => id)).size !== blocks.length
}

function mark(editor: LexicalEditor, blocks: Seen[]) {
  for (const { key, id } of blocks) {
    const element = editor.getElementByKey(key)
    if (element && id && element.getAttribute('data-block-id') !== id)
      element.setAttribute('data-block-id', id)
  }
}

useLexicalRegister((editor) => {
  // The blocks as of the last finished update: what "before" means to an edit in progress.
  let before = read(editor)

  /** For what no edit numbers: the document the plugin starts with, and a read-only one once it can be edited. */
  function settle() {
    if (!editor.isEditable() || !incomplete(before))
      return
    editor.update(() => {
      $getRoot().markDirty()
    }, { tag: HISTORY_MERGE_TAG })
  }

  const stop = [
    editor.registerNodeTransform(RootNode, () => {
      if (!editor.isEditable())
        return
      // Only when every block from before is gone is it worth asking whether the whole document
      // was swapped: its blocks are new ones, and none takes over an ID from the old document.
      const here = new Set($getRoot().getChildrenKeys())
      const swapped = before.length > 0 && !before.some(({ key }) => here.has(key)) && $arrivedWhole(editor)
      $numberBlocks(swapped
        ? []
        : before)
    }),
    editor.registerUpdateListener(() => {
      before = read(editor)
      mark(editor, before)
      settle()
    }),
    // Listeners run with updates held back, so this one waits for them to finish.
    editor.registerEditableListener(() => queueMicrotask(settle)),
  ]
  mark(editor, before)
  settle()
  return () => stop.forEach(off => off())
})
</script>

<template>
  <slot />
</template>
