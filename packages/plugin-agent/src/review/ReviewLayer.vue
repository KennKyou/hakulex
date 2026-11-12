<script setup lang="ts">
import type { AgentController } from '../agent'
import { $getBlockId } from '@hakulex/plugin-block-id'
import { useLexicalComposer, useLexicalRegister } from '@hakulex/vue-lexical'
import { $getRoot, REDO_COMMAND, UNDO_COMMAND } from 'lexical'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { place, START } from './layout'
import ReviewBar from './ReviewBar.vue'
import ReviewCard from './ReviewCard.vue'

/*
 * Shows what there is to review beside the blocks it is about. The cards live in a layer over
 * the editor, outside the editable area, so the document, its history and the caret never
 * meet them. Each card gets its place by a margin on the block it belongs to, set on the
 * block's element and taken off again when the card goes.
 */
const props = defineProps<{
  agent: AgentController
  bar: boolean
}>()

/** Space between a block and a card, and between cards, in pixels. */
const GAP = 12

const editor = useLexicalComposer()
const body = shallowRef<HTMLElement | null>(null)
const editable = ref(editor.isEditable())
/** The IDs of the document's blocks, in order, as of the editor's last update. */
const blockIds = shallowRef<string[]>([])
const positions = shallowRef<Record<string, { top: number, left: number, width: number }>>({})
const current = ref<string | null>(null)

const items = computed(() => props.agent.items.value)
const placed = computed(() => place(items.value, props.agent.state.value.proposal, blockIds.value))
const conflicts = computed(() => items.value.filter(item => item.state === 'conflict').length)

const cards = new Map<string, HTMLElement>()
/** The elements this layer has put a margin or a mark on, or has covered, to undo it again. */
const spaced = {
  marginTop: new Set<HTMLElement>(),
  marginBottom: new Set<HTMLElement>(),
}
const marked = new Set<HTMLElement>()
/** Each block's own margins as last measured, with what they were measured under. */
const naturals = new WeakMap<HTMLElement, { key: string, marginTop?: number, marginBottom?: number }>()
const covered = new Set<HTMLElement>()
const observer = typeof ResizeObserver === 'undefined'
  ? null
  : new ResizeObserver(() => layout())

/** Takes a block out of sight and out of reach: the caret skips it, and it can't be clicked into. */
function cover(element: HTMLElement) {
  element.dataset.agentHidden = 'true'
  element.style.visibility = 'hidden'
  element.setAttribute('contenteditable', 'false')
}
function uncover(element: HTMLElement) {
  delete element.dataset.agentHidden
  element.style.visibility = ''
  element.removeAttribute('contenteditable')
}

function setCard(id: string, element: unknown) {
  const previous = cards.get(id)
  if (previous && previous !== element)
    observer?.unobserve(previous)
  if (element instanceof HTMLElement) {
    cards.set(id, element)
    observer?.observe(element)
  }
  else {
    cards.delete(id)
  }
}

function blockElements() {
  const elements = new Map<string, HTMLElement>()
  const ids: string[] = []
  editor.getEditorState().read(() => {
    for (const child of $getRoot().getChildren()) {
      const id = $getBlockId(child)
      const element = editor.getElementByKey(child.getKey())
      if (!id || !element)
        continue
      ids.push(id)
      elements.set(id, element)
    }
  })
  return { elements, ids }
}

/** Puts every card in its place and keeps room for it; undoes what no longer applies. */
function layout() {
  const root = editor.getRootElement()
  if (!root)
    return
  const { elements, ids } = blockElements()
  const first = ids.length > 0
    ? elements.get(ids[0])!
    : null
  const height = (id: string) => cards.get(id)?.offsetHeight ?? 0

  // Per block: the card drawn on the block itself (a merged replacement, or a deletion's
  // answers), and the cards that follow it. Per document: the cards above the first block.
  const own = new Map<string, { id: string, covers: boolean }>()
  const below = new Map<string, string[]>()
  const marks = new Map<HTMLElement, string>()
  const hide = new Set<HTMLElement>()
  for (const { item, mode, anchor } of placed.value) {
    const element = elements.get(item.blockIds[0])
    if (mode === 'inline' || mode === 'delete') {
      own.set(anchor, { id: item.id, covers: mode === 'inline' })
      if (mode === 'inline' && element)
        hide.add(element)
      if (mode === 'delete' && element)
        marks.set(element, 'delete')
      continue
    }
    below.set(anchor, [
      ...below.get(anchor) ?? [],
      item.id,
    ])
    if (mode === 'stack' && element) {
      marks.set(element, item.state === 'conflict'
        ? 'conflict'
        : 'replace')
    }
  }

  for (const element of covered) {
    if (!hide.has(element))
      uncover(element)
  }
  covered.clear()
  for (const element of hide) {
    cover(element)
    covered.add(element)
  }
  for (const element of marked) {
    if (!marks.has(element))
      delete element.dataset.agentChange
  }
  marked.clear()
  for (const [element, kind] of marks) {
    element.dataset.agentChange = kind
    marked.add(element)
  }

  // Room, since it moves the blocks the cards are placed by. A merged replacement may be
  // taller than the block it covers; what follows a block goes under it, with a gap between.
  const stacked = (cardIds: string[]) => cardIds.reduce((sum, id) => sum + height(id) + GAP, 0)
  const wanted = {
    marginTop: new Map<HTMLElement, number>(),
    marginBottom: new Map<HTMLElement, number>(),
  }
  const above = below.get(START) ?? []
  /**
   * A block's own margin on one side, without what this layer has put there. Measuring it means
   * taking this layer's margin off for a moment, which moves the page, and a browser that keeps
   * the reader's place while the page moves (scroll anchoring) gives up after a few of those. So
   * it is measured once, and again only when it may have changed: another kind of block, another
   * class, or another place at the start or the end.
   */
  const natural = (element: HTMLElement, side: 'marginTop' | 'marginBottom') => {
    const key = [
      element.tagName,
      element.className,
      element === root.firstElementChild,
      element === root.lastElementChild,
    ].join(' ')
    let known = naturals.get(element)
    if (known?.key !== key) {
      known = { key }
      naturals.set(element, known)
    }
    if (known[side] === undefined) {
      if (element.style[side] !== '')
        element.style[side] = ''
      known[side] = Number.parseFloat(getComputedStyle(element)[side]) || 0
    }
    return known[side]
  }
  // What goes above the first block is added to the space it already keeps above itself.
  const firstMargin = first && above.length > 0
    ? natural(first, 'marginTop')
    : 0
  if (first && above.length > 0)
    wanted.marginTop.set(first, firstMargin + stacked(above))
  for (const id of ids) {
    const element = elements.get(id)!
    const on = own.get(id)
    const following = below.get(id) ?? []
    const taller = on?.covers
      ? Math.max(0, height(on.id) - element.offsetHeight)
      : 0
    if (taller === 0 && following.length === 0)
      continue
    // Its own space under it stays, and what is needed is added to it.
    const room = following.length > 0
      ? GAP + stacked(following)
      : 0
    wanted.marginBottom.set(element, taller + room + natural(element, 'marginBottom'))
  }
  for (const side of ['marginTop', 'marginBottom'] as const) {
    for (const element of spaced[side]) {
      if (!wanted[side].has(element))
        element.style[side] = ''
    }
    spaced[side] = new Set(wanted[side].keys())
    // Only what differs is written: a style set again to what it was is still a change to the page.
    for (const [element, size] of wanted[side]) {
      if (element.style[side] !== `${size}px`)
        element.style[side] = `${size}px`
    }
  }

  // Then the cards, from where the blocks now are.
  const next: Record<string, { top: number, left: number, width: number }> = {}
  const at = (id: string, top: number) => {
    next[id] = { top, left: root.offsetLeft, width: root.offsetWidth }
  }
  if (first) {
    let top = first.offsetTop - firstMargin - stacked(above)
    for (const id of above) {
      at(id, top)
      top += height(id) + GAP
    }
  }
  for (const id of ids) {
    const element = elements.get(id)!
    const on = own.get(id)
    if (on)
      at(on.id, element.offsetTop)
    let top = element.offsetTop + Math.max(element.offsetHeight, on?.covers
      ? height(on.id)
      : 0) + GAP
    for (const card of below.get(id) ?? []) {
      at(card, top)
      top += height(card) + GAP
    }
  }
  if (JSON.stringify(next) !== JSON.stringify(positions.value))
    positions.value = next
  if (blockIds.value.join() !== ids.join())
    blockIds.value = ids
}

function clear() {
  for (const side of ['marginTop', 'marginBottom'] as const) {
    for (const element of spaced[side])
      element.style[side] = ''
    spaced[side].clear()
  }
  for (const element of marked)
    delete element.dataset.agentChange
  marked.clear()
  for (const element of covered)
    uncover(element)
  covered.clear()
}

useLexicalRegister((registered) => {
  const stop = [
    registered.registerRootListener((root, previous) => {
      if (previous)
        observer?.unobserve(previous)
      if (root)
        observer?.observe(root)
      body.value = root?.parentElement ?? null
      layout()
    }),
    registered.registerUpdateListener(() => layout()),
    registered.registerEditableListener((value) => {
      editable.value = value
    }),
  ]
  editable.value = registered.isEditable()
  return () => stop.forEach(off => off())
})

// The cards have to be in the page before they can be measured.
watch(placed, () => nextTick(layout), { flush: 'post' })
onBeforeUnmount(() => {
  observer?.disconnect()
  clear()
})

/** Keeps the keyboard somewhere useful once the card that was pressed is gone. */
async function after(index: number) {
  await nextTick()
  const left = placed.value.map(entry => cards.get(entry.item.id)).filter(Boolean) as HTMLElement[]
  const target = left[Math.min(index, left.length - 1)]
  if (target)
    target.focus()
  else editor.focus()
}
function accept(id: string, overwrite: boolean) {
  const index = placed.value.findIndex(entry => entry.item.id === id)
  props.agent.accept(id, overwrite
    ? { overwrite: true }
    : undefined)
  after(index)
}
function reject(id: string) {
  const index = placed.value.findIndex(entry => entry.item.id === id)
  props.agent.reject(id)
  after(index)
}
/**
 * Undo and redo pressed on a card or on the bar go to the editor. After an answer the keyboard
 * is on the next card, and that is exactly when someone wants to take the answer back.
 */
function history(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey)
    return
  const key = event.key.toLowerCase()
  const redo = (key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey)
  if (!redo && key !== 'z')
    return
  event.preventDefault()
  editor.dispatchCommand(redo ? REDO_COMMAND : UNDO_COMMAND, undefined)
}

function step(by: 1 | -1) {
  const list = placed.value.map(entry => entry.item.id)
  if (list.length === 0)
    return
  const at = current.value === null
    ? -1
    : list.indexOf(current.value)
  const to = at < 0
    ? (by === 1
        ? 0
        : list.length - 1)
    : (at + by + list.length) % list.length
  current.value = list[to]
  const card = cards.get(list[to])
  if (card && typeof card.scrollIntoView === 'function')
    card.scrollIntoView({ block: 'nearest' })
}
</script>

<template>
  <Teleport v-if="body" :to="body">
    <div class="hlx-agent-layer" @keydown="history">
      <ReviewCard
        v-for="entry in placed"
        :key="entry.item.id"
        :ref="element => setCard(entry.item.id, (element as { $el?: unknown } | null)?.$el)"
        :entry="entry"
        :current="current === entry.item.id"
        :disabled="!editable"
        :style="positions[entry.item.id]
          ? { top: `${positions[entry.item.id].top}px`, left: `${positions[entry.item.id].left}px`, width: `${positions[entry.item.id].width}px` }
          : undefined"
        @accept="accept(entry.item.id, $event)"
        @reject="reject(entry.item.id)"
      />
    </div>
  </Teleport>
  <ReviewBar
    v-if="bar && items.length > 0"
    :total="items.length"
    :conflicts="conflicts"
    :disabled="!editable"
    @keydown="history"
    @step="step"
    @accept-all="agent.acceptAll()"
    @reject-all="agent.rejectAll()"
  />
</template>
