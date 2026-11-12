<script lang="ts">
import type { PropType } from 'vue'
import type { CodeToken } from '../code/highlight'
import { computed, defineComponent, Fragment, h } from 'vue'

/*
 * The numbered lines code blocks and code snippets share: plain text until highlighting has
 * loaded (so SSR and hydration agree), then Shiki's tokens. Marked lines are snippets' own.
 *
 * There is one element for each line, before highlighting and after: only what is inside it
 * changes. A press that begins on a line as its colors arrive still ends on that line, so the
 * click the two make isn't lost. A template can't say this without changing the HTML a server
 * sends, so the lines are drawn here.
 */
export default defineComponent({
  name: 'CodeLines',
  props: {
    code: { type: String, required: true },
    tokens: { type: Array as PropType<CodeToken[][] | null>, default: null },
    marked: { type: Object as PropType<ReadonlySet<number>>, default: undefined },
  },
  setup(props) {
    const lines = computed(() => props.code.split('\n'))
    /** How wide the line numbers are: as many digits as the last line has. */
    const digits = computed(() => String(lines.value.length).length)

    return () => h('pre', {
      'class': 'hlx-code-body hlx-code-lined',
      'style': { '--hlx-line-digits': digits.value },
      'data-highlighted': props.tokens
        ? ''
        : undefined,
    }, h('code', [
      h(Fragment, lines.value.map((line, index) => {
        const end = index < lines.value.length - 1
          ? '\n'
          : ''
        const colored = props.tokens?.[index]
        return h('span', {
          'key': index,
          'class': 'hlx-code-line',
          'data-highlight': props.marked?.has(index + 1)
            ? ''
            : undefined,
        }, colored
          ? [
              ...colored.map((token, part) => h('span', { key: part, style: token.style }, token.content)),
              end,
            ]
          : line + end)
      })),
    ]))
  },
})
</script>
