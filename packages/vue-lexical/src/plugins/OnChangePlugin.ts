import type { EditorState, LexicalEditor } from 'lexical'
import { HISTORY_MERGE_TAG } from 'lexical'
import { defineComponent } from 'vue'
import { useLexicalRegister } from '../composables/useLexicalRegister'

/**
 * Emits `change` after each committed update.
 * The initial state and `history-merge` updates are skipped by default.
 */
export const OnChangePlugin = defineComponent({
  name: 'OnChangePlugin',
  props: {
    ignoreHistoryMergeTagChange: { type: Boolean, default: true },
    ignoreSelectionChange: { type: Boolean, default: false },
  },
  emits: {
    change: (_editorState: EditorState, _editor: LexicalEditor, _tags: Set<string>) => true,
  },
  setup(props, { emit }) {
    useLexicalRegister(editor => editor.registerUpdateListener(
      ({ editorState, dirtyElements, dirtyLeaves, prevEditorState, tags }) => {
        if (
          (props.ignoreSelectionChange && dirtyElements.size === 0 && dirtyLeaves.size === 0)
          || (props.ignoreHistoryMergeTagChange && tags.has(HISTORY_MERGE_TAG))
          || prevEditorState.isEmpty()
        ) {
          return
        }
        emit('change', editorState, editor, tags)
      },
    ))
    return () => null
  },
})
