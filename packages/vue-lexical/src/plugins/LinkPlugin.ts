import type { LinkAttributes } from '@lexical/link'
import type { PropType } from 'vue'
import { namedSignals } from '@lexical/extension'
import { registerLink } from '@lexical/link'
import { defineComponent } from 'vue'
import { useLexicalRegister } from '../composables/useLexicalRegister'

/** Mirrors @lexical/link's LinkConfig, which the package does not export. */
interface LinkConfig {
  validateUrl: ((url: string) => boolean) | undefined
  attributes: LinkAttributes | undefined
}

/**
 * Handles `TOGGLE_LINK_COMMAND`. With `validateUrl`, pasting a valid URL over a
 * selection wraps it in a link and invalid URLs are rejected. Needs `LinkNode`.
 */
export const LinkPlugin = defineComponent({
  name: 'LinkPlugin',
  props: {
    validateUrl: { type: Function as PropType<(url: string) => boolean>, default: undefined },
    attributes: { type: Object as PropType<LinkAttributes>, default: undefined },
  },
  setup(props) {
    useLexicalRegister((editor) => {
      const defaults: LinkConfig = { validateUrl: undefined, attributes: undefined }
      return registerLink(editor, namedSignals(defaults, {
        validateUrl: props.validateUrl,
        attributes: props.attributes,
      }))
    })
    return () => null
  },
})
