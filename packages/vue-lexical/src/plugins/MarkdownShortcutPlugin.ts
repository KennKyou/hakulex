import type { Transformer } from '@lexical/markdown'
import type { PropType } from 'vue'
import { registerMarkdownShortcuts, TRANSFORMERS } from '@lexical/markdown'
import { defineComponent } from 'vue'
import { useLexicalRegister } from '../composables/useLexicalRegister'

/**
 * Converts markdown typed inline (`# `, `- `, `**bold**`…) into nodes.
 * Every transformer's node must be registered on the editor.
 */
export const MarkdownShortcutPlugin = defineComponent({
  name: 'MarkdownShortcutPlugin',
  props: {
    transformers: {
      type: Array as PropType<Transformer[]>,
      default: () => TRANSFORMERS,
    },
  },
  setup(props) {
    useLexicalRegister(editor => registerMarkdownShortcuts(editor, props.transformers))
    return () => null
  },
})
