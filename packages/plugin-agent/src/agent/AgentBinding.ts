import type { PropType } from 'vue'
import type { AgentController } from './types'
import { BlockIdPlugin } from '@hakulex/plugin-block-id'
import { useLexicalRegister } from '@hakulex/vue-lexical'
import { defineComponent, h } from 'vue'
import { hostFor } from './host'

/**
 * Joins an agent to the editor this is placed in, for as long as it is there, and gives the
 * editor's blocks the IDs an agent tells them apart by. Shows nothing.
 */
export const AgentBinding = defineComponent({
  name: 'AgentBinding',
  props: {
    agent: { type: Object as PropType<AgentController>, required: true },
  },
  setup(props) {
    useLexicalRegister((editor) => {
      const agent = props.agent
      agent.attach(hostFor(editor))
      const stop = [
        editor.registerUpdateListener(() => agent.refresh()),
        editor.registerEditableListener(() => agent.refresh()),
      ]
      return () => {
        stop.forEach(off => off())
        agent.attach(null)
      }
    })
    return () => h(BlockIdPlugin)
  },
})
