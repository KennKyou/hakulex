import { useLexicalRegister } from '@hakulex/vue-lexical'
import {
  registerTablePlugin,
  registerTableSelectionObserver,
  setScrollableTablesActive,
} from '@lexical/table'
import { mergeRegister } from '@lexical/utils'
import { defineComponent } from 'vue'

/** Editing behavior for tables. Needs `TableNode`, `TableRowNode` and `TableCellNode`. */
export const TablePlugin = defineComponent({
  name: 'TablePlugin',
  setup() {
    useLexicalRegister((editor) => {
      setScrollableTablesActive(editor, true)
      return mergeRegister(
        registerTablePlugin(editor),
        registerTableSelectionObserver(editor),
        () => setScrollableTablesActive(editor, false),
      )
    })
    return () => null
  },
})
