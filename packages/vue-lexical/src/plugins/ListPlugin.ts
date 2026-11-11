import { registerList } from '@lexical/list'
import { defineComponent } from 'vue'
import { useLexicalRegister } from '../composables/useLexicalRegister'

/** Bullet / numbered list commands and Enter / Backspace behavior. Needs `ListNode`, `ListItemNode`. */
export const ListPlugin = defineComponent({
  name: 'ListPlugin',
  props: {
    /** Keep numbering continuous when a list is split by a non-list block. */
    restoreNumbering: { type: Boolean, default: false },
  },
  setup(props) {
    useLexicalRegister(editor => registerList(editor, { restoreNumbering: props.restoreNumbering }))
    return () => null
  },
})
