import type { SerializedEditorState } from 'lexical'
import { describe, expect, it } from 'vitest'
import { createDefaultRegistry } from '../src/default-registry'
import { deserializeFromXml } from '../src/deserializer'
import { serializeToXml } from '../src/serializer'
import '../src/index-browser'

const registry = createDefaultRegistry()

function state(...children: any[]): SerializedEditorState {
  return {
    root: {
      type: 'root',
      children,
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  } as SerializedEditorState
}
const write = (...children: any[]) => serializeToXml(state(...children), registry)
const read = (xml: string) => deserializeFromXml(xml, registry).root.children as any[]

function image(extra: Record<string, unknown> = {}) {
  return {
    type: 'image',
    version: 1,
    $: { blockId: 'i1' },
    src: '/a.png',
    altText: 'a',
    ...extra,
  }
}
function gallery(images: unknown[]) {
  return {
    type: 'gallery',
    version: 1,
    $: { blockId: 'g1' },
    layout: 'grid',
    images,
  }
}

describe('file ids in LiteXML', () => {
  it('writes an image file id as file-id and reads it back', () => {
    const xml = write(image({ fileId: 'f-1' }))
    expect(xml).toContain('file-id="f-1"')
    expect(read(xml)[0]).toMatchObject({ type: 'image', src: '/a.png', fileId: 'f-1' })
  })

  it('writes no file-id for an image without one, and reads none back', () => {
    const xml = write(image())
    expect(xml).not.toContain('file-id')
    expect(read(xml)[0].fileId).toBeUndefined()
  })

  it('writes the file id of each gallery image and reads them back', () => {
    const xml = write(gallery([
      { src: '/a.png', alt: 'a', fileId: 'f-1' },
      { src: '/b.png' },
    ]))
    expect(xml).toContain('<img src="/a.png" alt="a" file-id="f-1" />')
    expect(xml).toContain('<img src="/b.png" />')
    const [first, second] = read(xml)[0].images
    expect(first).toMatchObject({ src: '/a.png', alt: 'a', fileId: 'f-1' })
    expect(second.fileId).toBeUndefined()
  })
})
