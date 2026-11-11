import type { SerializedNode } from '../src'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { RichRenderer } from '../src'
import { normalizeImageLayout } from '../src/image/src'

function ssr(extra: Record<string, unknown>) {
  const image: SerializedNode = {
    type: 'image',
    version: 1,
    src: 'https://example.com/a.png',
    altText: 'a',
    ...extra,
  }
  return renderToString(createSSRApp({
    render: () => h(RichRenderer, {
      value: {
        root: {
          type: 'root',
          children: [image],
        },
      },
    }),
  }))
}
const block = (html: string) => /<div class="hlx-image-block"[^>]*>/.exec(html)![0]
const picture = (html: string) => /<img[^>]*>/.exec(html)![0]

describe('image layout', () => {
  it.each(['float-left', 'float-right'])('marks the block as %s', async (layout) => {
    expect(block(await ssr({ layout }))).toContain(`data-layout="${layout}"`)
  })

  it('sets the display width on the floating block, not on the picture', async () => {
    const html = await ssr({ layout: 'float-left', displayWidth: 30 })
    expect(block(html)).toContain('--hlx-image-width:30%')
    expect(picture(html)).not.toContain('width:30%')
  })

  it('has no width of its own without a display width', async () => {
    expect(block(await ssr({ layout: 'float-right' }))).not.toContain('style=')
  })

  it('keeps the caption with the picture', async () => {
    const html = await ssr({ layout: 'float-left', caption: 'cap' })
    expect(block(html)).toContain('data-layout="float-left"')
    expect(html).toContain('<figcaption')
  })

  it.each([
    ['align-left'],
    ['float-left;color:red'],
    ['"><script>'],
    [42],
    [null],
    [
      { a: 1 },
    ],
  ])('uses the default layout for %j', async (layout) => {
    const html = await ssr({ layout, displayWidth: 30 })
    expect(block(html)).toBe('<div class="hlx-image-block">')
    expect(picture(html)).toContain('width:30%')
    expect(html).not.toContain('<script>')
  })

  it('accepts only what it can show', () => {
    expect(normalizeImageLayout('float-left')).toBe('float-left')
    expect(normalizeImageLayout('float-right')).toBe('float-right')
    expect(normalizeImageLayout('constructor')).toBeUndefined()
    expect(normalizeImageLayout(undefined)).toBeUndefined()
  })
})
