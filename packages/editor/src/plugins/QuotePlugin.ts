import type { LexicalNode } from 'lexical'
import type { QuoteState } from '../components/QuoteBar.vue'
import { contentTheme } from '@hakulex/style-token'
import { useLexicalComposer, useLexicalEditable, useLexicalRegister } from '@hakulex/vue-lexical'
import { $isQuoteNode } from '@lexical/rich-text'
import { mergeRegister } from '@lexical/utils'
import { $getNearestNodeFromDOMNode, $getSelection, $isElementNode, $isRangeSelection } from 'lexical'
import { computed, defineComponent, h, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import QuoteBar from '../components/QuoteBar.vue'
import { $isRichQuoteNode } from '../nodes/RichQuoteNode'

function $readState(): QuoteState | null {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed())
    return null
  let node: LexicalNode | null = selection.anchor.getNode()
  while (node && !$isQuoteNode(node))
    node = node.getParent()
  if (!node)
    return null
  return {
    key: node.getKey(),
    attribution: $isRichQuoteNode(node)
      ? node.getAttribution() ?? ''
      : '',
  }
}

/** Shows the attribution field while the caret is in a quote. */
export const QuotePlugin = defineComponent({
  name: 'QuotePlugin',
  setup() {
    const editor = useLexicalComposer()
    const editable = useLexicalEditable()
    const state = shallowRef<QuoteState | null>(null)
    const focused = shallowRef(false)
    const visible = computed(() => editable.value && focused.value
      ? state.value
      : null)

    function onMouseDown(event: MouseEvent) {
      const footer = (event.target as Element | null)?.closest?.(`.${contentTheme.quoteAttribution}`)
      if (!footer?.parentElement || !editor.isEditable())
        return
      event.preventDefault()
      const quote = footer.parentElement
      editor.update(() => {
        const node = $getNearestNodeFromDOMNode(quote)
        if ($isElementNode(node))
          node.selectEnd()
      })
      editor.focus()
    }

    function readFocus(event?: FocusEvent) {
      // During focusout the active element is still <body>, whatever is about to take focus.
      const next = event?.type === 'focusout'
        ? event.relatedTarget as Element | null
        : null
      const active = next ?? document.activeElement
      focused.value = !!active && (
        !!editor.getRootElement()?.contains(active) || !!active.closest('.hlx-callout-bar')
      )
    }
    onMounted(() => {
      readFocus()
      document.addEventListener('focusin', readFocus)
      document.addEventListener('focusout', readFocus)
    })
    onBeforeUnmount(() => {
      document.removeEventListener('focusin', readFocus)
      document.removeEventListener('focusout', readFocus)
    })

    useLexicalRegister(lexical => mergeRegister(
      lexical.registerUpdateListener(({ editorState }) => {
        const next = editorState.read($readState)
        const current = state.value
        if (next?.key !== current?.key || next?.attribution !== current?.attribution)
          state.value = next
      }),

      // The attribution is outside what Lexical manages, so a press there would lose the
      // caret. It goes to the end of the quote instead, which also brings up the field.
      lexical.registerRootListener((root, previous) => {
        previous?.removeEventListener('mousedown', onMouseDown)
        root?.addEventListener('mousedown', onMouseDown)
      }),
    ))

    return () => visible.value
      ? h(QuoteBar, { state: visible.value, editor })
      : null
  },
})
