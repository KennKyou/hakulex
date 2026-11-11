import type { LexicalEditor } from 'lexical'
import type { PropType } from 'vue'
import type { InitialConfig, InitialEditorState } from './composer'
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  createEditor,
  HISTORY_MERGE_TAG,
} from 'lexical'
import { defineComponent, markRaw, provide } from 'vue'
import { LexicalEditorKey } from './composer'

function applyInitialState(editor: LexicalEditor, state: InitialEditorState | undefined) {
  if (state === null)
    return

  if (state === undefined) {
    editor.update(() => {
      const root = $getRoot()
      if (root.isEmpty()) {
        const paragraph = $createParagraphNode()
        root.append(paragraph)
        if ($getSelection() !== null)
          paragraph.select()
      }
    }, { tag: HISTORY_MERGE_TAG, discrete: true })
    return
  }

  if (typeof state === 'string') {
    editor.setEditorState(editor.parseEditorState(state), { tag: HISTORY_MERGE_TAG })
    return
  }

  if (typeof state === 'function') {
    editor.update(() => {
      if ($getRoot().isEmpty())
        state(editor)
    }, { tag: HISTORY_MERGE_TAG, discrete: true })
    return
  }

  editor.setEditorState(state, { tag: HISTORY_MERGE_TAG })
}

/**
 * Creates a Lexical editor and provides it to descendants.
 * `initialConfig` is read once; later changes are ignored, as in `@lexical/react`.
 */
export const LexicalComposer = defineComponent({
  name: 'LexicalComposer',
  props: {
    initialConfig: { type: Object as PropType<InitialConfig>, required: true },
  },
  setup(props, { slots, expose }) {
    const { namespace, nodes, theme, editable, html, onError, editorState } = props.initialConfig

    const editor = markRaw(createEditor({
      namespace,
      nodes,
      theme,
      html,
      editable: editable ?? true,
      onError: error => (onError
        ? onError(error, editor)
        : console.error(error)),
    }))
    applyInitialState(editor, editorState)

    provide(LexicalEditorKey, editor)
    expose({ editor })

    return () => slots.default?.()
  },
})
