import type { ImageClickPayload, SerializedNode } from '../src'
import { renderToString } from '@vue/server-renderer'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { normalizeGallery, RichRenderer } from '../src'
import GalleryView from '../src/views/GalleryView.vue'
import ImageView from '../src/views/ImageView.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

function image(src: string, extra: Record<string, unknown> = {}): SerializedNode {
  return {
    type: 'image',
    version: 1,
    src,
    ...extra,
  }
}
const paragraph = (...children: SerializedNode[]): SerializedNode => ({ type: 'paragraph', children })
function doc(...children: SerializedNode[]) {
  return {
    root: { type: 'root', children },
  }
}

const A = image('https://example.com/a.png', {
  altText: '甲',
  width: 400,
  height: 300,
  caption: '第一張',
})
const B = image('https://example.com/b.png', { altText: '乙' })
const C = image('https://example.com/c.png')
const GALLERY: SerializedNode = {
  type: 'gallery',
  version: 1,
  images: [
    { src: 'https://example.com/g1.png', alt: 'g1' },
    { src: 'https://example.com/g2.png' },
    { src: 'https://example.com/g3.png', width: 10, height: 20 },
    { src: 'https://example.com/g4.png' },
  ],
}

function render(value: ReturnType<typeof doc>, onImageClick?: (payload: ImageClickPayload) => void) {
  return mount(RichRenderer, {
    props: { value, onImageClick },
    attachTo: document.body,
  })
}

describe('onImageClick on single images', () => {
  it('reports the clicked image and every single image, in document order, containers included', async () => {
    const onImageClick = vi.fn()
    const wrapper = render(doc(A, {
      type: 'banner',
      bannerType: 'note',
      children: [B],
    }, paragraph(), C), onImageClick)
    const images = wrapper.findAll('img.hlx-image')
    expect(images).toHaveLength(3)
    await images[1].trigger('click')
    expect(onImageClick).toHaveBeenCalledTimes(1)
    const payload: ImageClickPayload = onImageClick.mock.calls[0][0]
    expect(payload.images).toEqual([
      {
        src: 'https://example.com/a.png',
        alt: '甲',
        caption: '第一張',
        width: 400,
        height: 300,
      },
      { src: 'https://example.com/b.png', alt: '乙' },
      { src: 'https://example.com/c.png' },
    ])
    expect(payload.index).toBe(1)
    expect(payload.current).toEqual(payload.images[1])
    expect(payload.target).toBe(images[1].element)
  })

  it('opens with Enter or Space once focused, the same as a click', async () => {
    const onImageClick = vi.fn()
    const wrapper = render(doc(A, B), onImageClick)
    const second = wrapper.findAll('img.hlx-image')[1]
    expect(second.attributes('tabindex')).toBe('0')
    await second.trigger('keydown', { key: 'Enter' })
    await second.trigger('keydown', { key: ' ' })
    await second.trigger('keydown', { key: 'a' })
    expect(onImageClick).toHaveBeenCalledTimes(2)
    expect(onImageClick.mock.calls[0][0].index).toBe(1)
    expect(onImageClick.mock.calls[1][0].index).toBe(1)
  })

  it('leaves the output as it is without onImageClick, in SSR too', async () => {
    const value = doc(A)
    const html = await renderToString(createSSRApp({
      render: () => h(RichRenderer, { value }),
    }))
    expect(html).not.toContain('tabindex')
    expect(html).not.toContain('hlx-image-clickable')
    const wrapper = render(value)
    expect(wrapper.find('img').attributes('tabindex')).toBeUndefined()
    expect(wrapper.find('img').classes()).not.toContain('hlx-image-clickable')
  })

  it('leaves out an image it cannot show', async () => {
    const onImageClick = vi.fn()
    const wrapper = render(doc(A, image('javascript:alert(1)', { altText: '壞的' }), B), onImageClick)
    const invalid = wrapper.find('.hlx-image-invalid')
    expect(invalid.exists()).toBe(true)
    expect(invalid.attributes('tabindex')).toBeUndefined()
    await invalid.trigger('click')
    expect(onImageClick).not.toHaveBeenCalled()
    await wrapper.findAll('img.hlx-image')[1].trigger('click')
    expect(onImageClick.mock.calls[0][0].images.map((i: { src: string }) => i.src)).toEqual([
      'https://example.com/a.png',
      'https://example.com/b.png',
    ])
  })
})

describe('onImageClick on galleries', () => {
  it('reports only that gallery\'s images', async () => {
    const onImageClick = vi.fn()
    const wrapper = render(doc(A, GALLERY), onImageClick)
    const items = wrapper.findAll('.hlx-gallery-item img')
    expect(items[2].attributes('tabindex')).toBe('0')
    await items[2].trigger('click')
    const payload: ImageClickPayload = onImageClick.mock.calls[0][0]
    expect(payload.images).toEqual([
      { src: 'https://example.com/g1.png', alt: 'g1' },
      { src: 'https://example.com/g2.png' },
      { src: 'https://example.com/g3.png', width: 10, height: 20 },
      { src: 'https://example.com/g4.png' },
    ])
    expect(payload.index).toBe(2)
    expect(payload.target).toBe(items[2].element)

    await wrapper.find('img.hlx-image').trigger('click')
    expect(onImageClick.mock.calls[1][0].images).toEqual([
      {
        src: 'https://example.com/a.png',
        alt: '甲',
        caption: '第一張',
        width: 400,
        height: 300,
      },
    ])
  })
})

describe('outside a RichRenderer, as the editor uses the views', () => {
  it('neither focuses nor reports', () => {
    const single = mount(ImageView, {
      props: { src: 'https://example.com/a.png' },
    })
    expect(single.find('img').attributes('tabindex')).toBeUndefined()
    const gallery = mount(GalleryView, {
      props: {
        gallery: normalizeGallery({
          images: [
            { src: 'https://example.com/g1.png' },
          ],
        }),
      },
    })
    expect(gallery.find('img').attributes('tabindex')).toBeUndefined()
  })
})
