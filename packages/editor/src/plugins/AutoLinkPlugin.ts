import { useLexicalRegister } from '@hakulex/vue-lexical'
import {
  autoLinkEmailMatcher,
  AutoLinkNode,
  autoLinkUrlMatcher,
  registerAutoLink,
} from '@lexical/link'
import { $isTextNode } from 'lexical'
import { defineComponent } from 'vue'

/** Turns typed URLs and emails into `AutoLinkNode`s. Needs `AutoLinkNode`. */
export const AutoLinkPlugin = defineComponent({
  name: 'AutoLinkPlugin',
  setup() {
    useLexicalRegister((editor) => {
      const unregisterAutoLink = registerAutoLink(editor, {
        changeHandlers: [],
        excludeParents: [],
        matchers: [autoLinkUrlMatcher, autoLinkEmailMatcher],
      })
      // Matchers only see text, not its format, so a URL in inline code still gets
      // wrapped. Unlinking (not unwrapping) keeps it from being wrapped again.
      const unregisterCode = editor.registerNodeTransform(AutoLinkNode, (link) => {
        if (!link.getIsUnlinked() && link.getChildren().some(child => $isTextNode(child) && child.hasFormat('code')))
          link.setIsUnlinked(true)
      })
      return () => {
        unregisterCode()
        unregisterAutoLink()
      }
    })
    return () => null
  },
})
