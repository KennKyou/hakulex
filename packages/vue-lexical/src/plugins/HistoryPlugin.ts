import type { HistoryState } from '@lexical/history'
import type { PropType } from 'vue'
import { createEmptyHistoryState, registerHistory } from '@lexical/history'
import { defineComponent } from 'vue'
import { useLexicalRegister } from '../composables/useLexicalRegister'

/** Undo / redo. Changes within `delay` ms are merged into one history entry. */
export const HistoryPlugin = defineComponent({
  name: 'HistoryPlugin',
  props: {
    delay: { type: Number, default: 300 },
    /** Share history across editors (e.g. nested editors). */
    externalHistoryState: { type: Object as PropType<HistoryState>, default: undefined },
  },
  setup(props) {
    const ownState = createEmptyHistoryState()
    useLexicalRegister(editor =>
      registerHistory(editor, props.externalHistoryState ?? ownState, props.delay),
    )
    return () => null
  },
})
