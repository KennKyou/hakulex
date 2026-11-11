import type { SerializedNode } from '../src'
import { readFileSync } from 'node:fs'
import { renderToString } from '@vue/server-renderer'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h, nextTick } from 'vue'
import { GALLERY_PER_VIEWS, normalizeGallery, RichRenderer } from '../src'
import GalleryView from '../src/views/GalleryView.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

const images = [1, 2, 3, 4, 5].map(n => ({ src: `https://example.com/${n}.png` }))
function carousel(extra: Record<string, unknown> = {}): SerializedNode {
  return {
    type: 'gallery',
    version: 1,
    images,
    layout: 'carousel',
    ...extra,
  }
}

async function ssr(node: SerializedNode) {
  const html = await renderToString(createSSRApp({
    render: () => h(RichRenderer, {
      value: {
        root: {
          type: 'root',
          children: [node],
        },
      },
    }),
  }))
  const container = document.createElement('div')
  container.innerHTML = html
  return container.querySelector<HTMLElement>('.hlx-gallery')!
}

describe('perView', () => {
  it('keeps only the listed values', () => {
    expect(GALLERY_PER_VIEWS).toEqual([1, 1.2, 1.5, 2, 2.5, 3])
    for (const value of GALLERY_PER_VIEWS)
      expect(normalizeGallery({ images: [], perView: value }).perView).toBe(value)
    for (const value of [
      undefined,
      1.3,
      '2',
      -1,
      0,
      4,
      Number.NaN,
      {},
      null,
    ])
      expect(normalizeGallery({ images: [], perView: value }).perView).toBe(1)
  })

  it('sets how many a carousel shows, in SSR', async () => {
    const element = await ssr(carousel({ perView: 1.2 }))
    expect(element.getAttribute('style')).toBe('--hlx-gallery-per-view:1.2;')
    expect(element.dataset.perView).toBeDefined()
  })

  it('leaves the output as it is for one, a value not listed, or another layout', async () => {
    const plain = (await ssr(carousel())).outerHTML
    for (const node of [
      carousel({ perView: 1 }),
      carousel({ perView: 1.3 }),
      carousel({ perView: '2' }),
    ])
      expect((await ssr(node)).outerHTML).toBe(plain)
    const grid = await ssr(carousel({ layout: 'grid', perView: 2 }))
    expect(grid.getAttribute('style')).toBeNull()
    expect(grid.dataset.perView).toBeUndefined()
  })
})

/** A track 500 wide whose items are `stride` apart; happy-dom has no layout. */
function mounted(perView = 1, stride = 500) {
  const wrapper = mount(GalleryView, {
    props: {
      gallery: normalizeGallery(carousel({ perView })),
    },
    attachTo: document.body,
  })
  const track = wrapper.find('.hlx-gallery-track').element as HTMLElement
  Object.defineProperty(track, 'clientWidth', { value: 500 })
  Object.defineProperty(track, 'scrollWidth', { value: stride * 4 + (500 / perView) })
  track.querySelectorAll<HTMLElement>('.hlx-gallery-item').forEach((item, i) => {
    Object.defineProperty(item, 'offsetLeft', { value: i * stride })
  })
  const scrolls: number[] = []
  track.scrollTo = ((options: ScrollToOptions) => {
    scrolls.push(options.left!)
  }) as typeof track.scrollTo
  return { wrapper, track, scrolls }
}

describe('the count', () => {
  it('follows the scroll position, and shows the last at the right end', async () => {
    const { wrapper, track } = mounted(2, 256)
    const count = () => wrapper.find('.hlx-gallery-count').text()
    track.scrollLeft = 256
    await wrapper.find('.hlx-gallery-track').trigger('scroll')
    expect(count()).toBe('2 / 5')
    expect(wrapper.find('[aria-label="下一張"]').attributes('disabled')).toBeUndefined()
    track.scrollLeft = track.scrollWidth - track.clientWidth
    await wrapper.find('.hlx-gallery-track').trigger('scroll')
    expect(count()).toBe('5 / 5')
    expect(wrapper.find('[aria-label="下一張"]').attributes('disabled')).toBeDefined()
  })

  it('moves by one item, back from the right end too', async () => {
    const { wrapper, track, scrolls } = mounted(2, 256)
    await wrapper.find('[aria-label="下一張"]').trigger('click')
    expect(scrolls).toEqual([256])
    track.scrollLeft = track.scrollWidth - track.clientWidth
    await wrapper.find('.hlx-gallery-track').trigger('scroll')
    await wrapper.find('[aria-label="上一張"]').trigger('click')
    expect(scrolls.at(-1)).toBe(512)
  })
})

function pointer(type: string, clientX: number, pointerType = 'mouse') {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    pointerType,
    button: 0,
  })
}

describe('dragging with a mouse', () => {
  it('scrolls while dragging, then settles on the nearest image', async () => {
    const { track, scrolls } = mounted()
    const image = track.querySelector('img')!
    image.dispatchEvent(pointer('pointerdown', 400))
    window.dispatchEvent(pointer('pointermove', 300))
    expect(track.scrollLeft).toBe(100)
    expect(track.dataset.dragging).toBeDefined()
    window.dispatchEvent(pointer('pointermove', 100))
    expect(track.scrollLeft).toBe(300)
    window.dispatchEvent(pointer('pointerup', 100))
    expect(track.dataset.dragging).toBeUndefined()
    expect(scrolls).toEqual([500])
  })

  it('keeps snapping off until the settling scroll ends, so it glides there', async () => {
    const { track } = mounted()
    track.querySelector('img')!.dispatchEvent(pointer('pointerdown', 400))
    window.dispatchEvent(pointer('pointermove', 100))
    window.dispatchEvent(pointer('pointerup', 100))
    expect(track.dataset.settling).toBeDefined()
    track.dispatchEvent(new Event('scrollend'))
    expect(track.dataset.settling).toBeUndefined()
  })

  it('stops settling after a while where scrollend never comes', async () => {
    vi.useFakeTimers()
    try {
      const { track } = mounted()
      track.querySelector('img')!.dispatchEvent(pointer('pointerdown', 400))
      window.dispatchEvent(pointer('pointermove', 100))
      window.dispatchEvent(pointer('pointerup', 100))
      expect(track.dataset.settling).toBeDefined()
      vi.advanceTimersByTime(1000)
      expect(track.dataset.settling).toBeUndefined()
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('turns snapping off with a rule that outranks the carousel\'s own', () => {
    // happy-dom doesn't apply cascade order, so this reads the rules: the carousel turns
    // snapping on as `.hlx-gallery[data-layout='carousel'] .hlx-gallery-track`, which a plain
    // `.hlx-gallery-track[data-dragging]` doesn't outrank.
    const css = readFileSync(`${process.cwd()}/packages/style-token/src/content.css`, 'utf8')
    for (const state of ['dragging', 'settling']) {
      const rule = new RegExp(`\\.hlx-gallery\\[data-layout='carousel'\\] \\.hlx-gallery-track\\[data-${state}\\][^{]*\\{[^}]*scroll-snap-type: none`)
      expect(css).toMatch(rule)
    }
  })

  it('is not a click once it moved, so images don\'t open and selection stays', async () => {
    const onImageClick = vi.fn()
    const outside = vi.fn()
    const wrapper = mount({
      render: () => h('div', { onClick: outside }, [
        h(RichRenderer, {
          value: {
            root: {
              type: 'root',
              children: [
                carousel(),
              ],
            },
          },
          onImageClick,
        }),
      ]),
    }, { attachTo: document.body })
    const track = wrapper.find('.hlx-gallery-track').element as HTMLElement
    const image = track.querySelector('img')!
    image.dispatchEvent(pointer('pointerdown', 400))
    window.dispatchEvent(pointer('pointermove', 380))
    window.dispatchEvent(pointer('pointerup', 380))
    image.click()
    expect(onImageClick).not.toHaveBeenCalled()
    expect(outside).not.toHaveBeenCalled()

    await new Promise(resolve => setTimeout(resolve, 0))
    image.dispatchEvent(pointer('pointerdown', 400))
    window.dispatchEvent(pointer('pointermove', 402))
    window.dispatchEvent(pointer('pointerup', 402))
    image.click()
    expect(onImageClick).toHaveBeenCalledTimes(1)
    expect(outside).toHaveBeenCalledTimes(1)
  })

  it('leaves touch and pens to the browser', async () => {
    const { track, scrolls } = mounted()
    track.querySelector('img')!.dispatchEvent(pointer('pointerdown', 400, 'touch'))
    window.dispatchEvent(pointer('pointermove', 100, 'touch'))
    window.dispatchEvent(pointer('pointerup', 100, 'touch'))
    expect(track.scrollLeft).toBe(0)
    expect(track.dataset.dragging).toBeUndefined()
    expect(scrolls).toEqual([])
    await nextTick()
  })

  it('only drags a carousel', () => {
    const wrapper = mount(GalleryView, {
      props: {
        gallery: normalizeGallery(carousel({ layout: 'grid' })),
      },
      attachTo: document.body,
    })
    const track = wrapper.find('.hlx-gallery-track').element as HTMLElement
    track.querySelector('img')!.dispatchEvent(pointer('pointerdown', 400))
    window.dispatchEvent(pointer('pointermove', 100))
    expect(track.dataset.dragging).toBeUndefined()
    window.dispatchEvent(pointer('pointerup', 100))
  })
})
