import { registerRichText } from '@lexical/rich-text'
import { defineComponent, h } from 'vue'
import { useLexicalRegister } from '../composables/useLexicalRegister'
import { LexicalDecorators } from '../LexicalDecorators'

/**
 * Rich text behavior: block/inline formatting commands, paste, drag & drop.
 * Also renders Vue decorator nodes (`<LexicalDecorators>`).
 */
export const RichTextPlugin = defineComponent({
  name: 'RichTextPlugin',
  setup() {
    useLexicalRegister(editor => registerRichText(editor))
    return () => h(LexicalDecorators)
  },
})
