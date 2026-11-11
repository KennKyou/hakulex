import type { EditorState, LexicalEditor, SerializedEditorState } from 'lexical'
import type { PropType } from 'vue'
import { useLexicalComposer, useLexicalRegister } from '@hakulex/vue-lexical'
import { mergeRegister } from '@lexical/utils'
import { $createParagraphNode, $getRoot, HISTORY_MERGE_TAG } from 'lexical'
import { defineComponent, toRaw, watch } from 'vue'
import { onNestedChange } from './nested/content'
import { serializeEditorState, wrapUnknownNodes } from './unknown/document'

/**
 * Internal bridge between `<RichEditor>` props and the editor:
 * emits serialized state on content changes, applies external `modelValue`
 * changes, and keeps `editable` in sync.
 */
export const EditorModelPlugin = defineComponent({
  name: 'EditorModelPlugin',
  props: {
    modelValue: { type: Object as PropType<SerializedEditorState | null>, default: undefined },
    editable: { type: Boolean, required: true },
    /** Node types the editor has; the rest are kept as placeholders. */
    registered: { type: Object as PropType<Set<string>>, required: true },
  },
  emits: {
    'ready': (_editor: LexicalEditor) => true,
    'update:modelValue': (_value: SerializedEditorState) => true,
    'change': (_state: EditorState, _editor: LexicalEditor) => true,
  },
  setup(props, { emit }) {
    const editor = useLexicalComposer()
    // The object we last emitted; when the parent hands it back we skip re-applying it.
    let lastEmitted: SerializedEditorState | null | undefined = props.modelValue

    emit('ready', editor)

    function emitChange(editorState: EditorState) {
      lastEmitted = serializeEditorState(editorState)
      emit('update:modelValue', lastEmitted)
      emit('change', editorState, editor)
    }

    useLexicalRegister(editor => mergeRegister(
      editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves, prevEditorState, tags }) => {
        const selectionOnly = dirtyElements.size === 0 && dirtyLeaves.size === 0
        if (!selectionOnly && !tags.has(HISTORY_MERGE_TAG) && !prevEditorState.isEmpty())
          emitChange(editorState)
      }),
      // A step's content lives in its own editor, so this editor's state doesn't change with it.
      onNestedChange(editor, () => emitChange(editor.getEditorState())),
    ))

    watch(() => props.modelValue, (value) => {
      if (value === undefined || toRaw(value) === lastEmitted)
        return
      lastEmitted = toRaw(value)
      if (value === null) {
        editor.update(() => {
          $getRoot().clear().append($createParagraphNode())
        }, { tag: HISTORY_MERGE_TAG })
        return
      }
      editor.setEditorState(editor.parseEditorState(wrapUnknownNodes(value, props.registered)), { tag: HISTORY_MERGE_TAG })
    })

    watch(() => props.editable, value => editor.setEditable(value))

    return () => null
  },
})
