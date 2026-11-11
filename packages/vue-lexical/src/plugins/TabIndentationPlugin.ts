import { registerTabIndentation } from '@lexical/extension'
import { defineComponent } from 'vue'
import { useLexicalRegister } from '../composables/useLexicalRegister'

/** Tab / Shift+Tab indent and outdent (nests list items). Traps focus inside the editor. */
export const TabIndentationPlugin = defineComponent({
  name: 'TabIndentationPlugin',
  props: {
    maxIndent: { type: Number, default: undefined },
  },
  setup(props) {
    useLexicalRegister(editor => registerTabIndentation(editor, props.maxIndent))
    return () => null
  },
})
