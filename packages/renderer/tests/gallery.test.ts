import type { SerializedNode } from '../src'
import { renderToString } from '@vue/server-renderer'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { normalizeGallery, RichRenderer } from '../src'
import GalleryView from '../src/views/GalleryView.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

const image = (src: unknown, extra: Record<string, unknown> = {}) => ({ src, ...extra })
const A = image('https://example.com/a.png', { alt: '甲', width: 400, height: 300 })
const B = image('https://example.com/b.png')
const C = image('/c.png')
function gallery(images: unknown, extra: Record<string, unknown> = {}): SerializedNode {
  return {
    type: 'gallery',
    version: 1,
    images,
    ...extra,
  }
}

async function ssr(node: SerializedNode) {
  const value = {
    root: {
      type: 'root',
      children: [node],
    },
  }
  const html = await renderToString(createSSRApp({
    render: () => h(RichRenderer, { value }),
  }))
  const container = document.createElement('div')
  container.innerHTML = html
  return container
}

describe('reading stored data', () => {
  it('uses defaults for what is missing or not valid', () => {
    for (const extra of [
      {},
      {
        layout: 'x',
        aspect: 'x',
        fit: 'x',
        maxItemHeight: -1,
      },
      {
        layout: 1,
        aspect: null,
        fit: {},
        maxItemHeight: '9',
      },
    ]) {
      const { layout, aspect, fit, maxItemHeight } = normalizeGallery({ images: [], ...extra })
      expect({ layout, aspect, fit, maxItemHeight }).toEqual({
        layout: 'grid',
        aspect: 'auto',
        fit: 'cover',
        maxItemHeight: undefined,
      })
    }
  })

  it.each([undefined, 'a', 7, {}, null])('has no images for %s', (images) => {
    expect(normalizeGallery({ images }).images).toEqual([])
  })

  it('leaves out what can\'t be shown', () => {
    const { images } = normalizeGallery({
      images: [
        1,
        null,
        'a',
        {},
        image(7),
        image('javascript:alert(1)'),
        image('data:image/svg+xml,<svg/>'),
        image('//evil.com/a.png'),
        B,
      ],
    })
    expect(images.map((item: { src: string }) => item.src)).toEqual([B.src])
  })

  it('only keeps sizes that are whole positive numbers and alt that is text', () => {
    const [item] = normalizeGallery({
      images: [
        image('/a.png', { width: -1, height: '9', alt: 7 }),
      ],
    }).images
    expect(item).toEqual({
      src: '/a.png',
      alt: '',
      width: undefined,
      height: undefined,
    })
  })
})

describe('server output', () => {
  it('grid: images with their details, aspect and fit', async () => {
    const html = await ssr(gallery([A, B], { layout: 'grid', aspect: '4:3', fit: 'contain' }))
    expect(html.querySelector('.hlx-gallery')!.getAttribute('data-layout')).toBe('grid')
    const img = html.querySelector('img')!
    expect(img.getAttribute('src')).toBe(A.src)
    expect(img.getAttribute('alt')).toBe('甲')
    expect(img.getAttribute('width')).toBe('400')
    expect(img.getAttribute('height')).toBe('300')
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.getAttribute('style')).toContain('object-fit:contain')
    expect(html.querySelector('.hlx-gallery-item')!.getAttribute('style')).toContain('aspect-ratio:4 / 3')
    expect(html.querySelectorAll('img')).toHaveLength(2)
  })

  it('auto aspect sets no ratio', async () => {
    const html = await ssr(gallery([A]))
    expect(html.querySelector('.hlx-gallery-item')!.getAttribute('style') ?? '').not.toContain('aspect-ratio')
  })

  it('masonry: ignores the aspect, and limits the height', async () => {
    const html = await ssr(gallery([A, B], { layout: 'masonry', aspect: '1:1', maxItemHeight: 240 }))
    expect(html.querySelector('.hlx-gallery')!.getAttribute('data-layout')).toBe('masonry')
    expect(html.querySelector('.hlx-gallery-item')!.getAttribute('style') ?? '').not.toContain('aspect-ratio')
    expect(html.querySelector('img')!.getAttribute('style')).toContain('max-height:240px')
  })

  it('only masonry takes the height', async () => {
    const html = await ssr(gallery([A, B], { layout: 'grid', maxItemHeight: 240 }))
    expect(html.querySelector('img')!.getAttribute('style') ?? '').not.toContain('max-height')
  })

  it('carousel: every image is in the output, with buttons', async () => {
    const html = await ssr(gallery([A, B, C], { layout: 'carousel' }))
    expect(html.querySelector('.hlx-gallery')!.getAttribute('data-layout')).toBe('carousel')
    expect(html.querySelectorAll('.hlx-gallery-track img')).toHaveLength(3)
    expect(html.querySelector<HTMLButtonElement>('[aria-label="上一張"]')!.hasAttribute('disabled')).toBe(true)
    expect(html.querySelector<HTMLButtonElement>('[aria-label="下一張"]')!.hasAttribute('disabled')).toBe(false)
  })

  it('carousel with one image is a grid', async () => {
    const html = await ssr(gallery([A], { layout: 'carousel' }))
    expect(html.querySelector('.hlx-gallery')!.getAttribute('data-layout')).toBe('grid')
    expect(html.querySelector('[aria-label="下一張"]')).toBeNull()
  })

  it('doesn\'t let stored values become styles or markup', async () => {
    const html = await ssr(gallery([
      image('/a.png', { alt: '"><script>alert(1)</script>' }),
    ], { aspect: '1:1;background:url(x)', fit: 'cover;color:red', maxItemHeight: '1px;color:red' }))
    expect(html.querySelector('script')).toBeNull()
    expect(html.innerHTML).not.toContain('color:red')
    expect(html.innerHTML).not.toContain('url(x)')
  })

  it.each([
    undefined,
    [],
    [1],
    [
      image('javascript:alert(1)'),
    ],
  ])('outputs nothing for %o', async (images) => {
    expect((await ssr(gallery(images))).querySelector('.hlx-gallery')).toBeNull()
  })
})

describe('the carousel', () => {
  function mounted() {
    return mount(GalleryView, {
      props: {
        gallery: normalizeGallery({
          images: [A, B, C],
          layout: 'carousel',
        }),
      },
      attachTo: document.body,
    })
  }

  it('moves one image at a time, stopping at the ends', async () => {
    const wrapper = mounted()
    const scrolls: number[] = []
    const track = wrapper.find('.hlx-gallery-track').element as HTMLElement
    Object.defineProperty(track, 'clientWidth', { value: 500 })
    track.scrollTo = ((options: ScrollToOptions) => scrolls.push(options.left!)) as typeof track.scrollTo
    const prev = wrapper.find('[aria-label="上一張"]')
    const next = wrapper.find('[aria-label="下一張"]')
    await next.trigger('click')
    expect(scrolls).toEqual([500])
    expect(prev.attributes('disabled')).toBeUndefined()
    await next.trigger('click')
    expect(scrolls).toEqual([500, 1000])
    expect(next.attributes('disabled')).toBeDefined()
    await prev.trigger('click')
    expect(scrolls).toEqual([500, 1000, 500])
    await flushPromises()
  })

  it('follows scrolling by hand', async () => {
    const wrapper = mounted()
    const track = wrapper.find('.hlx-gallery-track').element as HTMLElement
    Object.defineProperty(track, 'clientWidth', { value: 500 })
    track.scrollLeft = 1000
    await wrapper.find('.hlx-gallery-track').trigger('scroll')
    expect(wrapper.find('[aria-label="下一張"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.hlx-gallery-count').text()).toBe('3 / 3')
  })
})
