/** How far a mouse moves before a press is a drag rather than a click, in pixels. */
const THRESHOLD = 4
/** Longest a settling scroll takes, for browsers without `scrollend`. */
const SETTLE_TIMEOUT = 700

export interface CarouselDragOptions {
  /** Whether to drag at all: only a carousel does. */
  enabled: () => boolean
  /** Settles on the nearest item once the drag ends. */
  settle: () => void
}

/**
 * Lets a mouse drag the carousel's scrolling track. Touch, pens and touchpads already scroll it
 * natively, so only a mouse is handled. After a drag, the click its release makes is dropped, so
 * an image doesn't open and the editor's selection stays.
 */
export function attachCarouselDrag(track: HTMLElement, options: CarouselDragOptions) {
  let startX = 0
  let startScroll = 0
  let dragging = false
  let settleTimer: ReturnType<typeof setTimeout> | undefined

  /* Snapping stays off until the settling scroll ends; turning it on sooner jumps the track. */
  function endSettling() {
    clearTimeout(settleTimer)
    track.removeEventListener('scrollend', endSettling)
    delete track.dataset.settling
  }

  function onMove(event: PointerEvent) {
    const moved = event.clientX - startX
    if (!dragging) {
      if (Math.abs(moved) <= THRESHOLD)
        return
      dragging = true
      endSettling()
      track.dataset.dragging = ''
    }
    track.scrollLeft = startScroll - moved
  }

  function swallowClick(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
  }

  function onUp() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    if (!dragging)
      return
    dragging = false
    // The release's click comes right after; let it go by, then stop listening.
    track.addEventListener('click', swallowClick, { capture: true })
    setTimeout(() => track.removeEventListener('click', swallowClick, { capture: true }), 0)
    track.dataset.settling = ''
    delete track.dataset.dragging
    track.addEventListener('scrollend', endSettling)
    settleTimer = setTimeout(endSettling, SETTLE_TIMEOUT)
    options.settle()
  }

  function onDown(event: PointerEvent) {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !options.enabled())
      return
    startX = event.clientX
    startScroll = track.scrollLeft
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  track.addEventListener('pointerdown', onDown)
  return () => {
    track.removeEventListener('pointerdown', onDown)
    onUp()
    endSettling()
  }
}
