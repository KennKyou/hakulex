<script setup lang="ts">
import type { CodeToken } from '../code/highlight'
import { computed } from 'vue'

/*
 * The numbered lines code blocks and code snippets share: plain text until highlighting has
 * loaded (so SSR and hydration agree), then Shiki's tokens. Marked lines are snippets' own.
 */
const props = defineProps<{
  code: string
  tokens: CodeToken[][] | null
  marked?: ReadonlySet<number>
}>()

const lines = computed(() => props.code.split('\n'))
/** How wide the line numbers are: as many digits as the last line has. */
const digits = computed(() => String(lines.value.length).length)
function mark(index: number) {
  return props.marked?.has(index + 1)
    ? ''
    : undefined
}
</script>

<template>
  <pre class="hlx-code-body hlx-code-lined" :style="{ '--hlx-line-digits': digits }" :data-highlighted="tokens ? '' : undefined"><code><template v-if="tokens"><span v-for="(line, i) in tokens" :key="i" class="hlx-code-line" :data-highlight="mark(i)"><span v-for="(token, j) in line" :key="j" :style="token.style">{{ token.content }}</span>{{ i < tokens.length - 1 ? '\n' : '' }}</span></template><template v-else><span v-for="(line, i) in lines" :key="i" class="hlx-code-line" :data-highlight="mark(i)">{{ line }}{{ i < lines.length - 1 ? '\n' : '' }}</span></template></code></pre>
</template>
