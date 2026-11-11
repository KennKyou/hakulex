<script setup lang="ts">
import type { CodeToken } from '../code/highlight'
import type { SnippetFile } from '../snippet'
import { computed, onBeforeUnmount, onMounted, shallowRef, useId, useTemplateRef, watch } from 'vue'
import { fileIcon } from '../code-snippet/file-kind'
import { snippetLanguage } from '../snippet'
import CodeCopyButton from './CodeCopyButton.vue'
import CodeLines from './CodeLines.vue'

const props = defineProps<{ files: SnippetFile[] }>()

const id = useId()
const panelId = (index: number) => `${id}-panel-${index}`
const tabs = useTemplateRef<HTMLButtonElement[]>('tabs')

// By position: nothing says stored names are different.
const active = shallowRef(0)
const current = computed(() => props.files[active.value] ?? props.files[0])
watch(() => props.files.length, (length) => {
  if (active.value >= length)
    active.value = 0
})

/* Collapsing, as code blocks do: by the shown file's lines, so SSR and hydration agree. */
const COLLAPSE_LINES = 20
const canCollapse = computed(() => current.value.code.split('\n').length > COLLAPSE_LINES)
const expanded = shallowRef(false)
const collapsed = computed(() => canCollapse.value && !expanded.value)
watch(active, () => (expanded.value = false))

function select(index: number) {
  active.value = index
  tabs.value?.[index]?.focus()
}

function onTabKeydown(event: KeyboardEvent) {
  const count = props.files.length
  const moves: Record<string, number> = {
    ArrowLeft: (active.value - 1 + count) % count,
    ArrowRight: (active.value + 1) % count,
    Home: 0,
    End: count - 1,
  }
  if (!Object.hasOwn(moves, event.key))
    return
  event.preventDefault()
  // Inside an editor, these keys would move its caret too.
  event.stopPropagation()
  select(moves[event.key])
}

/* Highlighting: plain text on the server and first client render (so hydration
   matches), then Shiki tokens once it has loaded. */
const tokens = shallowRef<(CodeToken[][] | null)[]>([])
let request = 0
async function rehighlight() {
  const run = ++request
  tokens.value = []
  const { highlightCode } = await import('../code/highlight')
  const result = await Promise.all(props.files.map(file => highlightCode(file.code, snippetLanguage(file))))
  if (run === request)
    tokens.value = result
}
onMounted(() => {
  watch(() => props.files, rehighlight, { immediate: true })
})
onBeforeUnmount(() => {
  request++
})

// The file's icon, as a component the template can place.
function FileIcon(props: { name: string, language?: string }) {
  return fileIcon(props.name, props.language)
}
</script>

<template>
  <div class="hlx-snippet hlx-code-card" role="region" aria-label="程式碼片段" :data-collapsed="collapsed ? '' : undefined">
    <div class="hlx-code-header">
      <div v-if="files.length > 1" class="hlx-snippet-tabs" role="tablist" aria-label="檔案">
        <button
          v-for="(file, index) in files"
          :key="index"
          ref="tabs"
          type="button"
          class="hlx-snippet-tab"
          role="tab"
          :aria-selected="index === active"
          :aria-controls="panelId(index)"
          :tabindex="index === active ? 0 : -1"
          @click="active = index"
          @keydown="onTabKeydown"
        >
          <FileIcon :name="file.filename" :language="file.language" /><span>{{ file.filename }}</span>
        </button>
      </div>
      <span v-else class="hlx-snippet-title"><FileIcon :name="current.filename" :language="current.language" /><span>{{ current.filename }}</span></span>
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
        <CodeCopyButton :code="current.code" />
      </span>
    </div>
    <div
      v-for="(file, index) in files"
      :id="panelId(index)"
      :key="index"
      :role="files.length > 1 ? 'tabpanel' : undefined"
      :hidden="index !== active"
    >
      <CodeLines :code="file.code" :tokens="tokens[index] ?? null" :marked="file.highlightLines" />
    </div>
  </div>
</template>
