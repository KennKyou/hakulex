import type { SerializedDocument } from '../src'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { RichRenderer } from '../src'

function doc(image: Record<string, unknown>): SerializedDocument {
  return {
    root: {
      type: 'root',
      children: [
        { type: 'image', version: 1, ...image },
      ],
    },
  }
}

function ssr(image: Record<string, unknown>) {
  return renderToString(createSSRApp({
    render: () => h(RichRenderer, {
      value: doc(image),
    }),
  }))
}

describe('image rendering (SSR)', () => {
  it('outputs an img with alt, reserved size and lazy loading', async () => {
    const html = await ssr({
      src: 'https://example.com/a.png',
      altText: 'A "cat" <3',
      width: 1200,
      height: 800,
    })
    expect(html).toContain('<div class="hlx-image-block">')
    const img = /<img[^>]*>/.exec(html)?.[0] ?? ''
    expect(img).toContain('src="https://example.com/a.png"')
    expect(img).toContain('alt="A &quot;cat&quot; &lt;3"')
    expect(img).toContain('width="1200"')
    expect(img).toContain('height="800"')
    expect(img).toContain('loading="lazy"')
  })

  it.each([
    ['https://example.com/a.png'],
    ['http://example.com/a.png'],
    ['/uploads/a.png'],
    ['a.png'],
    ['../a.png'],
    ['data:image/png;base64,AAAA'],
    ['data:image/jpeg;base64,AAAA'],
    ['data:image/gif;base64,AAAA'],
    ['data:image/webp;base64,AAAA'],
    ['data:image/avif;base64,AAAA'],
  ])('shows the allowed src %s', async (src) => {
    expect(await ssr({ src, altText: 'x' })).toContain(`src="${src}"`)
  })

  it.each([
    ['javascript:alert(1)'],
    ['JaVaScRiPt:alert(1)'],
    ['java\nscript:alert(1)'],
    [' javascript:alert(1)'],
    ['blob:https://example.com/1'],
    ['data:image/svg+xml;base64,AAAA'],
    ['data:text/html,x'],
    ['file:///etc/passwd'],
    ['//evil.example/a.png'],
    ['\\\\evil.example/a.png'],
    [''],
  ])('refuses the src %j and shows the alt text instead', async (src) => {
    const html = await ssr({ src, altText: 'fallback text' })
    expect(html).not.toContain('<img')
    expect(html).toContain('fallback text')
  })

  it('still marks an unsafe image with no alt text', async () => {
    const html = await ssr({ src: 'javascript:alert(1)', altText: '' })
    expect(html).not.toContain('<img')
    expect(html).toContain('無法顯示圖片')
  })

  it.each([
    [
      { width: 0, height: 800 },
    ],
    [
      { width: -1, height: 800 },
    ],
    [
      { width: 1.5, height: 800 },
    ],
    [
      { width: '100', height: 800 },
    ],
    [
      { width: Number.NaN, height: 800 },
    ],
  ])('treats invalid size %j as not provided', async (size) => {
    const html = await ssr({ src: 'a.png', altText: 'x', ...size })
    const img = /<img[^>]*>/.exec(html)?.[0] ?? ''
    expect(img).toContain('src="a.png"')
    expect(img).not.toMatch(/\swidth=/)
    expect(img).toContain('height="800"')
  })

  it('ignores fields it does not know', async () => {
    const html = await ssr({
      src: 'a.png',
      altText: 'x',
      thumbhash: 'hidden-hash',
    })
    expect(html).toContain('src="a.png"')
    expect(html).not.toContain('hidden-hash')
  })
})

describe('image caption', () => {
  it('wraps the image in a figure and escapes the caption', async () => {
    const html = await ssr({
      src: 'a.png',
      altText: 'x',
      caption: '  <script>alert(1)</script> "cat"  ',
    })
    expect(html).toContain('<figure class="hlx-image-figure"><img')
    expect(html).toContain('<figcaption class="hlx-image-caption">&lt;script&gt;alert(1)&lt;/script&gt; &quot;cat&quot;</figcaption></figure>')
    expect(html).not.toContain('<script>')
  })

  it.each([
    ['no caption', {}],
    [
      'an empty caption',
      { caption: '   ' },
    ],
    [
      'a caption that is not a string',
      { caption: 42 },
    ],
  ])('keeps the plain img with %s', async (_name, extra) => {
    const html = await ssr({ src: 'a.png', altText: 'x', ...extra })
    expect(html).not.toContain('<figure')
    expect(html).not.toContain('figcaption')
    expect(html).toContain('<div class="hlx-image-block"><img')
  })

  it('shows the caption under an image it cannot display', async () => {
    const html = await ssr({ src: 'javascript:alert(1)', altText: 'x', caption: 'note' })
    expect(html).not.toContain('<img')
    expect(html).toContain('hlx-image-invalid')
    expect(html).toContain('<figcaption class="hlx-image-caption">note</figcaption>')
  })
})

describe('image display width', () => {
  const imgOf = async (extra: Record<string, unknown>) => /<img[^>]*>/.exec(await ssr({
    src: 'a.png',
    altText: 'x',
    width: 800,
    height: 600,
    ...extra,
  }))?.[0] ?? ''

  it('sizes the image as a percentage and keeps the reserved size', async () => {
    const img = await imgOf({ displayWidth: 50 })
    expect(img).toContain('style="width:50%;"')
    expect(img).toContain('width="800"')
    expect(img).toContain('height="600"')
  })

  it.each([
    [5, 'width:10%'],
    [150, 'width:100%'],
    [33.6, 'width:34%'],
  ])('clamps and rounds %j', async (displayWidth, expected) => {
    expect(await imgOf({ displayWidth })).toContain(expected)
  })

  it.each([
    ['a string', '50; background:url(x)'],
    ['NaN', Number.NaN],
    ['null', null],
    ['missing', undefined],
  ])('treats %s as not provided', async (_name, displayWidth) => {
    expect(await imgOf({ displayWidth })).not.toContain('style=')
  })
})

describe('a paragraph holding a block', () => {
  const paragraph = (...children: Record<string, unknown>[]) => renderToString(createSSRApp({
    render: () => h(RichRenderer, {
      value: {
        root: {
          type: 'root',
          children: [
            { type: 'paragraph', children },
          ],
        },
      },
    }),
  }))
  const image = { type: 'image', src: 'https://example.com/a.png', altText: 'a' }
  const text = { type: 'text', text: '字', format: 0 }

  it('is a div, in the same order and with the same class', async () => {
    const plain = await paragraph(text)
    const html = await paragraph(text, image)
    expect(html).not.toContain('<p')
    const className = /<p class="([^"]*)"/.exec(plain)![1]
    expect(html).toContain(`<div class="${className}"`)
    expect(html.indexOf('字')).toBeLessThan(html.indexOf('<img'))
  })

  it.each([
    ['text', text],
    [
      'a link',
      {
        type: 'link',
        url: 'https://example.com',
        children: [text],
      },
    ],
    [
      'an inline file',
      {
        type: 'file',
        src: 'https://example.com/a.pdf',
        name: 'a.pdf',
        display: 'inline',
      },
    ],
  ])('stays a p with %s', async (_name, child) => {
    expect(await paragraph(child)).toContain('<p')
  })

  it('hydrates without warnings', async () => {
    const app = () => createSSRApp({
      render: () => h(RichRenderer, {
        value: {
          root: {
            type: 'root',
            children: [
              {
                type: 'paragraph',
                children: [image, text],
              },
            ],
          },
        },
      }),
    })
    const container = document.createElement('div')
    container.innerHTML = await renderToString(app())
    const warn = vi.spyOn(console, 'warn')
    app().mount(container)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
