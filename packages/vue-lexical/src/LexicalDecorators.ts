import type { NodeKey } from 'lexical'
import type { VueDecorator } from './decorator'
import { defineComponent, h, onErrorCaptured, shallowRef, Teleport } from 'vue'
import { useLexicalRegister } from './composables/useLexicalRegister'
import { useLexicalComposer } from './composer'

/** Isolates one decorator so a throwing component doesn't take the editor down. */
const DecoratorBoundary = defineComponent({
  name: 'LexicalDecoratorBoundary',
  props: {
    nodeKey: { type: String, required: true },
  },
  setup(props, { slots }) {
    const failed = shallowRef(false)
    onErrorCaptured((error) => {
      console.error(`[vue-lexical] decorator for node ${props.nodeKey} failed`, error)
      failed.value = true
      return false
    })
    return () => (failed.value
      ? h('span', { 'data-lexical-decorator-error': '' })
      : slots.default?.())
  },
})

/**
 * Mounts every `DecoratorNode<VueDecorator>` into the DOM element Lexical made
 * for it, via `<Teleport>`. Components stay in this component's tree, so they
 * can `inject` the editor and anything else provided above the composer.
 * `<RichTextPlugin>` renders this; mount it yourself only without that plugin.
 */
export const LexicalDecorators = defineComponent({
  name: 'LexicalDecorators',
  setup() {
    const editor = useLexicalComposer()
    const decorators = shallowRef<Record<NodeKey, VueDecorator>>({})

    // The listener fires after reconciliation, so every element exists by then.
    useLexicalRegister((editor) => {
      decorators.value = editor.getDecorators<VueDecorator>()
      return editor.registerDecoratorListener<VueDecorator>((next) => {
        decorators.value = next
      })
    })

    return () => Object.entries(decorators.value).map(([key, decorator]) => {
      const target = editor.getElementByKey(key)
      if (!target)
        return null
      return h(Teleport, { key, to: target }, [
        h(DecoratorBoundary, { nodeKey: key }, () => h(decorator.component, { nodeKey: key, ...decorator.props })),
      ])
    })
  },
})
