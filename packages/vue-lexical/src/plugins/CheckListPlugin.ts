import { registerCheckList } from '@lexical/list'
import { defineComponent } from 'vue'
import { useLexicalRegister } from '../composables/useLexicalRegister'

/**
 * Check list command, click / keyboard toggling. Needs `ListNode`, `ListItemNode`.
 * The click target is the list item's `::before` box, so the theme must give it a width.
 */
export const CheckListPlugin = defineComponent({
  name: 'CheckListPlugin',
  props: {
    disableTakeFocusOnClick: { type: Boolean, default: false },
  },
  setup(props) {
    useLexicalRegister(editor =>
      registerCheckList(editor, { disableTakeFocusOnClick: props.disableTakeFocusOnClick }),
    )
    return () => null
  },
})
