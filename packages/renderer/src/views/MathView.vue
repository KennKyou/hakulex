<script setup lang="ts">
import { computed, inject, onMounted, shallowRef, watch } from 'vue'
import { loadKatex, loadKatexStyles, mathKey, renderMathToString } from '../math/katex'
import { PrerenderedKey } from '../prerender'

const props = defineProps<{
  equation: string
  displayMode?: boolean
}>()

const prerendered = inject(PrerenderedKey, () => undefined)
const key = computed(() => mathKey(props.equation, !!props.displayMode))

/* Prerendered HTML is used on both server and client, so hydration matches.
   Otherwise the TeX source shows until KaTeX has loaded on the client. */
const clientHtml = shallowRef<string | null>(null)
const html = computed(() => prerendered()?.math?.[key.value] ?? clientHtml.value)

// v-html below is KaTeX output: KaTeX escapes its input and runs with trust: false.
let request = 0
async function render() {
  const id = ++request
  const [katex] = await Promise.all([
    loadKatex(),
    loadKatexStyles(),
  ])
  if (id === request)
    clientHtml.value = renderMathToString(katex, props.equation, !!props.displayMode)
}

onMounted(() => {
  // Prerendered pages still need the stylesheet for later edits / navigation.
  void loadKatexStyles()
  watch(key, () => {
    if (!prerendered()?.math?.[key.value])
      void render()
  }, { immediate: true })
})
</script>

<template>
  <component
    :is="displayMode ? 'div' : 'span'"
    class="hlx-math"
    :data-display="displayMode ? 'block' : 'inline'"
  >
    <span v-if="html" class="hlx-math-rendered" v-html="html" />
    <code v-else class="hlx-math-source">{{ equation }}</code>
  </component>
</template>
