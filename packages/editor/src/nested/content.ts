import type { EditorState, Klass, LexicalEditor, LexicalNode, LexicalNodeReplacement, SerializedEditorState } from 'lexical'
import type { EditorNode } from '../nodes'
import { useLexicalRegister } from '@hakulex/vue-lexical'
import { $getRoot, createEditor } from 'lexical'
import { defineComponent } from 'vue'
import { registeredTypes, serializeEditorState, wrapUnknownNodes } from '../unknown/document'

/** An editor inside another one, such as a step's or a grid cell's, shared by every version of its node. */
export interface NestedContent {
  /** Holds the content. Undo can bring it back, since old versions of the node still have it. */
  editor: LexicalEditor
  /** The content as loaded, to tell whether it was edited. */
  baseline: string
}

// Lexical registers these in every editor.
const CORE_TYPES = new Set([
  'root',
  'paragraph',
  'text',
  'linebreak',
  'tab',
  'artificial',
])
// Containers inside containers never end, and footnotes are numbered across the document by the outer editor.
const OUTER_ONLY_TYPES = new Set([
  'steps',
  'nested-doc',
  'grid-container',
  'footnote',
  'footnote-section',
])

const nestedConfigs = new WeakMap<LexicalEditor, { nodes: EditorNode[], registered: Set<string> }>()

function nestedConfig(parent: LexicalEditor) {
  let config = nestedConfigs.get(parent)
  if (!config) {
    const nodes: EditorNode[] = []
    for (const [type, { klass, replace, replaceWithKlass }] of parent._nodes) {
      if (OUTER_ONLY_TYPES.has(type) || (CORE_TYPES.has(type) && !replace))
        continue
      nodes.push(replace
        ? { replace: klass, with: replace, withKlass: (replaceWithKlass ?? undefined) as Klass<LexicalNode> | undefined } as LexicalNodeReplacement
        : klass)
    }
    config = {
      nodes,
      registered: registeredTypes(nodes),
    }
    nestedConfigs.set(parent, config)
  }
  return config
}

/** The nodes an editor inside `parent` has. */
export const nestedNodes = (parent: LexicalEditor) => nestedConfig(parent).nodes

/**
 * What an editor holds, including a state set before it had an element to render into:
 * Lexical only commits that once it has one, and a nested editor may not be on the page.
 */
export function latestState(editor: LexicalEditor): EditorState {
  return editor._pendingEditorState ?? editor.getEditorState()
}

const contentOf = (editor: LexicalEditor) => JSON.stringify(serializeEditorState(latestState(editor)))

export function createEmptyContent(): SerializedEditorState {
  return {
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children: [
        {
          type: 'paragraph',
          version: 1,
          format: '',
          indent: 0,
          direction: null,
          textFormat: 0,
          textStyle: '',
          children: [],
        },
      ],
    },
  } as unknown as SerializedEditorState
}

export function createNestedContent(parent: LexicalEditor, stored: unknown): NestedContent {
  const { nodes, registered } = nestedConfig(parent)
  const editor = createEditor({
    namespace: parent._config.namespace,
    theme: parent._config.theme,
    nodes,
    editable: parent.isEditable(),
    parentEditor: parent,
    onError: error => parent._onError(error),
  })
  const load = (content: unknown) => editor.setEditorState(editor.parseEditorState(wrapUnknownNodes(content as SerializedEditorState, registered)))
  try {
    load(stored)
  }
  // Whatever is wrong with what's stored, it shows as blank and stays stored until it's edited.
  catch {
    load(createEmptyContent())
  }
  return {
    editor,
    baseline: contentOf(editor),
  }
}

/** The content to store if it was edited. Otherwise `undefined`: Lexical would tidy up what was loaded. */
export function editedContent(nested: NestedContent): unknown {
  const content = contentOf(nested.editor)
  return content === nested.baseline
    ? undefined
    : JSON.parse(content)
}

export function nestedText(editor: LexicalEditor): string {
  return latestState(editor).read(() => $getRoot().getTextContent())
}

/* Telling the outer editor about changes: its state doesn't hold the content, and its history has to stay out of it. */

const nestedListeners = new WeakMap<LexicalEditor, Set<() => void>>()
const synced = new WeakMap<LexicalEditor, string>()

/** Calls `listener` when the content of an editor inside `parent` changes. */
export function onNestedChange(parent: LexicalEditor, listener: () => void): () => void {
  let listeners = nestedListeners.get(parent)
  if (!listeners) {
    listeners = new Set()
    nestedListeners.set(parent, listeners)
  }
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify(parent: LexicalEditor) {
  for (const listener of nestedListeners.get(parent) ?? [])
    listener()
}

/** Watches a nested editor while it's on the page. Plugins re-dirty nodes on mount, so only real changes count. */
export function registerNestedSync(editor: LexicalEditor, baseline: string): () => void {
  const parent = editor._parentEditor
  if (!parent)
    return () => {}
  const check = () => {
    const content = contentOf(editor)
    if (content === (synced.get(editor) ?? baseline))
      return
    synced.set(editor, content)
    notify(parent)
  }
  // It may have been changed by undo while it was off the page.
  check()
  return editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
    if (dirtyElements.size || dirtyLeaves.size)
      check()
  })
}

export const NestedSyncPlugin = defineComponent({
  name: 'NestedSyncPlugin',
  props: {
    baseline: { type: String, required: true },
  },
  setup(props) {
    useLexicalRegister(editor => registerNestedSync(editor, props.baseline))
    return () => null
  },
})
