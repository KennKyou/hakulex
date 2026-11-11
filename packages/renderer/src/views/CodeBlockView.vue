<script setup lang="ts">
import type { CodeToken } from '../code/highlight'
import { computed, onMounted, shallowRef, watch } from 'vue'
import { fileIcon } from '../code-snippet/file-kind'
import { normalizeLanguage } from '../code/languages'
import CodeCopyButton from './CodeCopyButton.vue'
import CodeLines from './CodeLines.vue'

const props = withDefaults(defineProps<{
  code: string
  language?: string
  /** Skip syntax highlighting (the editor supplies its own body). */
  highlight?: boolean
  /** Allow collapsing long code (the editor turns this off). */
  collapsible?: boolean
}>(), {
  language: 'plaintext',
  highlight: true,
  collapsible: true,
})

defineSlots<{
  /** Replaces the language label (the editor puts its picker here). */
  language?: () => unknown
  /** Extra header controls before the copy button. */
  actions?: () => unknown
  /** Replaces the highlighted body (the editor mounts CodeMirror here). */
  default?: () => unknown
}>()

/** Blocks longer than this start collapsed. By line count, so SSR and hydration agree. */
const COLLAPSE_LINES = 20

const language = computed(() => normalizeLanguage(props.language))
const lineCount = computed(() => props.code.split('\n').length)
/** The language's icon, as code snippets show it. */
const LanguageIcon = () => fileIcon('', language.value.id)

/* Highlighting: plain text on the server and first client render (so hydration
   matches), then Shiki tokens once it has loaded. */
const tokens = shallowRef<CodeToken[][] | null>(null)
let request = 0
async function rehighlight() {
  const id = ++request
  tokens.value = null
  if (!props.highlight)
    return
  const result = await import('../code/highlight').then(m => m.highlightCode(props.code, language.value.id))
  if (id === request)
    tokens.value = result
}
onMounted(() => {
  watch(() => [props.code, language.value.id, props.highlight], rehighlight, { immediate: true })
})

/* Collapsing: CSS caps the height, so the full code stays in the HTML and can be scrolled. */
const canCollapse = computed(() => props.collapsible && lineCount.value > COLLAPSE_LINES)
const expanded = shallowRef(false)
const collapsed = computed(() => canCollapse.value && !expanded.value)
</script>

<template>
  <div class="hlx-code-card" role="region" aria-label="程式碼區塊" :data-language="language.id" :data-collapsed="collapsed ? '' : undefined">
    <div class="hlx-code-header">
      <span class="hlx-code-lang">
        <span class="hlx-code-lang-icon" aria-hidden="true"><LanguageIcon /></span>
        <slot name="language">
          <span class="hlx-code-language">{{ language.label }}</span>
        </slot>
      </span>
      <span class="hlx-code-actions">
        <slot name="actions" />
        <button
          v-if="canCollapse"
          type="button"
          class="hlx-code-toggle"
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        >
          {{ expanded ? '收合' : '展開' }}
        </button>
        <CodeCopyButton :code="code" />
      </span>
    </div>
    <slot>
      <CodeLines :code="code" :tokens="tokens" />
    </slot>
  </div>
</template>
