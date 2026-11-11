import type { LexicalEditor } from 'lexical'
import type { PropType } from 'vue'
import { defineComponent, inject, markRaw, onBeforeUnmount, provide } from 'vue'
import { LexicalEditorKey } from './composer'

/**
 * Provides an editor that already exists, such as one a node holds, to what's inside. Everything
 * in there works as usual, with `useLexicalComposer()` returning this editor. It follows the
 * outer editor being read-only. The editor outlives this component, so it can be mounted again.
 */
export const LexicalNestedComposer = defineComponent({
  name: 'LexicalNestedComposer',
  props: {
    editor: { type: Object as PropType<LexicalEditor>, required: true },
  },
  setup(props, { slots }) {
    const parent = inject(LexicalEditorKey, null)
    const editor = markRaw(props.editor)
    provide(LexicalEditorKey, editor)

    if (parent) {
      editor._parentEditor = parent
      editor.setEditable(parent.isEditable())
      const stop = parent.registerEditableListener(editable => editor.setEditable(editable))
      onBeforeUnmount(stop)
    }

    return () => slots.default?.()
  },
})
