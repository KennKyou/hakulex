<script setup lang="ts">
import type { DynamicMountHandle, DynamicMountInput, DynamicUrlStatus } from '../dynamic'
import { computed, inject, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { DynamicImportKey, DynamicSettingsKey, dynamicUrlStatus, importDynamicModule, isDynamicComponentModule } from '../dynamic'

const props = defineProps<{
  url: string
  componentProps: Record<string, unknown>
  initialHeight: number
}>()

const settings = inject(DynamicSettingsKey, () => ({ theme: 'light' as const }))
const importModule = inject(DynamicImportKey, importDynamicModule)

/*
 * On the server, and until the browser has mounted it, this is just a box of the kept height:
 * nothing loads there. In the browser it loads once it comes near the screen.
 */
type State = 'idle' | 'waiting' | 'loading' | 'mounted' | 'failed' | DynamicUrlStatus
const state = shallowRef<State>('idle')
const crossOrigin = shallowRef(false)
const box = useTemplateRef<HTMLElement>('box')
const host = useTemplateRef<HTMLElement>('host')

const input = computed<DynamicMountInput>(() => ({
  props: props.componentProps,
  host: { theme: settings().theme },
}))

let handle: DynamicMountHandle | null = null
let observer: IntersectionObserver | null = null
// Bumped on every load and on leaving, so a module that arrives late isn't mounted.
let attempt = 0

function unmountComponent() {
  try {
    handle?.unmount()
  }
  catch (error) {
    console.error('[hakulex dynamic]', error)
  }
  handle = null
}

async function load() {
  const id = ++attempt
  unmountComponent()
  const status = dynamicUrlStatus(props.url, location.href, settings().allow)
  if (status !== 'ok') {
    state.value = status
    return
  }
  const resolved = new URL(props.url, location.href)
  crossOrigin.value = resolved.origin !== location.origin
  state.value = 'loading'
  try {
    const module = await importModule(resolved.href)
    if (id !== attempt)
      return
    const component = (module as { default?: unknown } | null)?.default
    if (!isDynamicComponentModule(component))
      throw new Error('The module\'s default export has no mount(container, input).')
    const shadow = host.value!.shadowRoot ?? host.value!.attachShadow({ mode: 'open' })
    // Whatever the page sets on its text, such as white-space in the editor, stops here.
    const container = document.createElement('div')
    container.style.all = 'initial'
    container.style.display = 'block'
    container.style.minHeight = `${props.initialHeight}px`
    container.style.colorScheme = settings().theme
    shadow.replaceChildren(container)
    handle = component.mount(container, input.value)
    state.value = 'mounted'
  }
  catch (error) {
    if (id !== attempt)
      return
    console.error('[hakulex dynamic]', error)
    state.value = 'failed'
  }
}

function start() {
  if (!props.url) {
    state.value = 'empty'
    return
  }
  state.value = 'waiting'
  if (typeof IntersectionObserver === 'undefined') {
    void load()
    return
  }
  observer?.disconnect()
  observer = new IntersectionObserver((entries) => {
    if (!entries.some(entry => entry.isIntersecting))
      return
    observer?.disconnect()
    observer = null
    void load()
  }, { rootMargin: '400px 0px' })
  observer.observe(box.value!)
}

onMounted(start)
onBeforeUnmount(() => {
  attempt++
  observer?.disconnect()
  unmountComponent()
})

// A new address loads again; new props or a theme go to the component as they are.
watch(() => props.url, start)
watch(input, (next) => {
  const container = host.value?.shadowRoot?.firstElementChild as HTMLElement | null | undefined
  if (container)
    container.style.colorScheme = next.host.theme
  handle?.update?.(next)
})
watch(() => props.initialHeight, (height) => {
  const container = host.value?.shadowRoot?.firstElementChild as HTMLElement | null | undefined
  if (container)
    container.style.minHeight = `${height}px`
})

const message = computed(() => {
  switch (state.value) {
    case 'idle': return '互動元件'
    case 'waiting':
    case 'loading': return '載入元件中…'
    case 'empty': return '沒有元件網址'
    case 'unsafe': return '這個網址無法使用'
    case 'not-allowed': return '未允許載入這個網址的元件'
    case 'failed': return '無法載入元件'
    default: return null
  }
})
</script>

<template>
  <div
    ref="box"
    class="hlx-dynamic"
    :data-state="state"
    :style="{ minHeight: `${initialHeight}px` }"
    aria-label="互動元件"
  >
    <div ref="host" class="hlx-dynamic-host" />
    <div v-if="message" class="hlx-dynamic-overlay" :role="state === 'failed' || state === 'not-allowed' || state === 'unsafe' ? 'alert' : undefined">
      <span>{{ message }}</span>
      <span v-if="url && state !== 'idle' && state !== 'waiting' && state !== 'loading'" class="hlx-dynamic-url">{{ url }}</span>
      <span v-if="state === 'failed' && crossOrigin" class="hlx-dynamic-hint">來自其他網域的模組，伺服器要允許 CORS。</span>
      <button v-if="state === 'failed'" type="button" class="hlx-dynamic-retry" @click.stop="load">
        重試
      </button>
    </div>
  </div>
</template>
