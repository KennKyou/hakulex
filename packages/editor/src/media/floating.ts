import type { LexicalEditor } from 'lexical'
import type { ComputedRef, Ref, ShallowRef } from 'vue'
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'

/*
 * What sits over the page by a block, the toolbar while it is picked and a panel while one is
 * open: where the block is, measured again as the page scrolls, the window resizes, the editor
 * changes or the block itself changes size.
 */

export interface BlockBox { top: number, right: number, bottom: number, left: number }

type Style = Record<string, string>
const NOWHERE: Style = {}

export function useBlockFloating(editor: LexicalEditor, element: Ref<HTMLElement | null>, active: Ref<boolean>): {
  box: ShallowRef<BlockBox | null>
  toolbarStyle: ComputedRef<Record<string, string>>
  panelStyle: (width: number) => ComputedRef<Record<string, string>>
  measure: () => void
} {
  const box = shallowRef<BlockBox | null>(null)
  function measure() {
    const rect = element.value?.getBoundingClientRect()
    box.value = rect
      ? {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        }
      : null
  }

  let stop: (() => void) | undefined
  function listen(on: boolean) {
    if (on && !stop) {
      measure()
      window.addEventListener('scroll', measure, true)
      window.addEventListener('resize', measure)
      const unregister = editor.registerUpdateListener(measure)
      // A block may draw after it mounts, and change size as it is edited.
      const resize = typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure)
      if (element.value)
        resize?.observe(element.value)
      stop = () => {
        window.removeEventListener('scroll', measure, true)
        window.removeEventListener('resize', measure)
        unregister()
        resize?.disconnect()
      }
    }
    else if (!on && stop) {
      stop()
      stop = undefined
      box.value = null
    }
  }
  watch(active, listen, { flush: 'post' })
  // A block may mount already active: one just inserted with its panel open.
  onMounted(() => listen(active.value))
  onBeforeUnmount(() => listen(false))

  /** Above the block, at its right edge; the toolbar's own CSS lifts it clear. */
  const toolbarStyle = computed<Style>(() => box.value
    ? { top: `${box.value.top}px`, left: `${box.value.right}px` }
    : NOWHERE)

  /*
   * Where a panel goes: beside the block if there is room, so the block shows each edit; else
   * under it; else over its top, lined up with its right edge and kept on screen.
   */
  function panelStyle(preferred: number) {
    return computed<Style>(() => {
      if (!box.value || typeof window === 'undefined')
        return NOWHERE
      const { innerWidth: across, innerHeight: down } = window
      const width = Math.min(preferred, across - 32)
      const tucked = Math.min(Math.max(16, box.value.right - width), across - width - 16)
      let top: number
      let left: number
      if (across - box.value.right - 12 >= width + 16) {
        top = Math.max(8, box.value.top)
        left = box.value.right + 12
      }
      else if (down - box.value.bottom - 8 >= 320) {
        top = box.value.bottom + 8
        left = tucked
      }
      else {
        top = Math.max(8, box.value.top + 4)
        left = tucked
      }
      return {
        'top': `${top}px`,
        'left': `${left}px`,
        'width': `${width}px`,
        'max-height': `${Math.min(520, Math.max(200, down - top - 16))}px`,
      }
    })
  }

  return {
    box,
    toolbarStyle,
    panelStyle,
    measure,
  }
}

/** Calls back when something is pressed outside the given elements, while `on`. */
export function useOutsidePress(elements: () => (Element | null | undefined)[], on: Ref<boolean>, pressed: () => void): void {
  function onDown(event: Event) {
    const target = event.target as Node
    if (elements().some(element => element?.contains(target)))
      return
    pressed()
  }
  function listen(value: boolean) {
    if (value)
      document.addEventListener('pointerdown', onDown, true)
    else
      document.removeEventListener('pointerdown', onDown, true)
  }
  watch(on, listen, { flush: 'post' })
  onMounted(() => listen(on.value))
  onBeforeUnmount(() => listen(false))
}
