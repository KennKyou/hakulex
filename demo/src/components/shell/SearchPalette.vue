<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { searchPages } from '../../site/search'

/*
 * The search over every page. ⌘K opens it, except while typing: in an editor that key adds a
 * link.
 */
const open = defineModel<boolean>('open', { required: true })

const router = useRouter()
const query = ref('')
const active = ref(0)
const input = ref<HTMLInputElement>()
const list = ref<HTMLElement>()
const results = computed(() => searchPages(query.value))
let returnTo: HTMLElement | null = null

watch(query, () => active.value = 0)
watch(open, async (value) => {
  if (value) {
    returnTo = document.activeElement as HTMLElement | null
    query.value = ''
    active.value = 0
    await nextTick()
    input.value?.focus()
  }
  else {
    await nextTick()
    returnTo?.focus?.()
  }
})

function isTyping(target: EventTarget | null) {
  const element = target as HTMLElement | null
  return !!element && (element.isContentEditable || element.tagName === 'INPUT' || element.tagName === 'TEXTAREA')
}

function onGlobalKey(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k')
    return
  if (open.value) {
    event.preventDefault()
    open.value = false
  }
  else if (!isTyping(event.target)) {
    event.preventDefault()
    open.value = true
  }
}
onMounted(() => window.addEventListener('keydown', onGlobalKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey))

function move(by: number) {
  const count = results.value.length
  if (!count)
    return
  active.value = (active.value + by + count) % count
  nextTick(() => list.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }))
}

function go(index: number) {
  const entry = results.value[index]
  if (!entry)
    return
  returnTo = null
  open.value = false
  router.push(entry.path)
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    move(event.key === 'ArrowDown'
      ? 1
      : -1)
  }
  else if (event.key === 'Enter') {
    event.preventDefault()
    go(active.value)
  }
  else if (event.key === 'Escape') {
    event.preventDefault()
    open.value = false
  }
}
</script>

<template>
  <div v-if="open" class="site-palette-backdrop" @mousedown.self="open = false">
    <div class="site-palette" role="dialog" aria-modal="true" aria-label="搜尋">
      <input
        ref="input"
        v-model="query"
        type="text"
        aria-label="搜尋頁面"
        placeholder="搜尋節點、外掛、套件…"
        @keydown="onKey"
      >
      <ul v-if="results.length" ref="list" role="listbox" aria-label="結果">
        <li
          v-for="(entry, index) in results"
          :key="entry.path"
          role="option"
          :aria-selected="index === active"
          @mousemove="active = index"
          @click="go(index)"
        >
          {{ entry.label }}
          <span>{{ entry.section }}</span>
        </li>
      </ul>
      <p v-else>
        沒有結果
      </p>
    </div>
  </div>
</template>

<style scoped>
.site-palette-backdrop {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: flex;
  justify-content: center;
  padding: 12vh 16px 16px;
  background: rgb(0 0 0 / 0.35);
}

.site-palette {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 560px;
  max-height: 60vh;
  align-self: flex-start;
  overflow: hidden;
  border: 1px solid var(--hlx-color-border);
  border-radius: 12px;
  background: var(--hlx-color-bg-elevated);
  box-shadow: var(--hlx-shadow-modal);
  color: var(--hlx-color-text);
}

input {
  flex: none;
  box-sizing: border-box;
  width: 100%;
  height: 44px;
  padding: 0 16px;
  border: 0;
  border-bottom: 1px solid var(--hlx-color-border);
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
}

ul {
  margin: 0;
  padding: 6px;
  overflow-y: auto;
  list-style: none;
}

li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

li[aria-selected='true'] {
  background: var(--hlx-color-fill);
}

li span {
  color: var(--hlx-color-text-tertiary);
  font-size: 12px;
}

p {
  margin: 0;
  padding: 24px;
  color: var(--hlx-color-text-tertiary);
  font-size: 14px;
  text-align: center;
}
</style>
