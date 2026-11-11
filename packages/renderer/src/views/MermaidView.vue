<script setup lang="ts">
import { computed, inject, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { diagramFonts, estimateDiagramHeight, renderDiagram } from '../mermaid/pele'
import { PrerenderedKey } from '../prerender'

const props = defineProps<{ source: string }>()

const prerendered = inject(PrerenderedKey, () => undefined)
const figure = useTemplateRef<HTMLElement>('figure')

/* Prerendered SVG is used on both server and client, so hydration matches.
   Otherwise a placeholder of about the right height shows until pele renders. */
const clientSvg = shallowRef<string | null>(null)
const error = shallowRef<string | null>(null)
// v-html below is pele output: it escapes diagram text and we disable links and images.
const svg = computed(() => prerendered()?.diagrams?.[props.source] ?? clientSvg.value)
// While loading, the source stays in the DOM (visually hidden) for screen readers and crawlers.
const placeholderHeight = computed(() => `${estimateDiagramHeight(props.source)}px`)

let request = 0
async function render() {
  const id = ++request
  // Measured in the fonts the page uses, so boxes fit their text.
  const result = await renderDiagram(props.source, figure.value
    ? diagramFonts(figure.value)
    : {})
  if (id !== request)
    return
  clientSvg.value = 'svg' in result
    ? result.svg
    : null
  error.value = 'error' in result
    ? result.error
    : null
}

onMounted(() => {
  watch(() => props.source, () => {
    error.value = null
    if (!props.source.trim() || prerendered()?.diagrams?.[props.source])
      return
    void render()
  }, { immediate: true })
})
</script>

<template>
  <figure ref="figure" class="hlx-mermaid">
    <div v-if="svg" class="hlx-mermaid-svg" role="img" aria-label="Mermaid 圖表" v-html="svg" />
    <div v-else-if="error" class="hlx-mermaid-error" role="alert">
      <p>圖表無法顯示：{{ error }}</p>
      <details>
        <summary>原始碼</summary>
        <pre>{{ source }}</pre>
      </details>
    </div>
    <div v-else class="hlx-mermaid-loading" :style="{ minHeight: placeholderHeight }">
      <span class="hlx-mermaid-spinner" aria-hidden="true" />
      <span>載入圖表…</span>
      <pre class="hlx-visually-hidden">{{ source }}</pre>
    </div>
  </figure>
</template>
