import type { SerializedEditorState } from 'lexical'
import { describe, expect, it } from 'vitest'
import { createDefaultRegistry } from '../src/default-registry'
import { deserializeFromXml } from '../src/deserializer'
import { serializeToXml } from '../src/serializer'
import '../src/index-browser'

/*
 * A gallery keeps each image's width and height, and for some a thumbhash: the page uses them to
 * hold the image's place before it has loaded. They have to survive the trip through LiteXML,
 * which is how a model hands a gallery back.
 */

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

function gallery(images: unknown[]) {
  return {
    type: 'gallery',
    version: 1,
    $: { blockId: 'g1' },
    layout: 'grid',
    images,
  }
}

const FULL = {
  src: '/a.png',
  alt: '甲',
  width: 1200,
  height: 800,
  thumbhash: '1QcSHQRnh493V4dIh4eXh1h4kJUI',
}
const SIZED = {
  src: '/b.png',
  alt: '乙',
  width: 640,
  height: 480,
}
const BARE = { src: '/c.png', alt: '丙' }

describe('a gallery image\'s size and thumbhash in LiteXML', () => {
  it('are written on each img that has them, and only there', () => {
    const xml = write(gallery([FULL, SIZED, BARE]))
    expect(xml).toContain('<img src="/a.png" alt="甲" width="1200" height="800" thumbhash="1QcSHQRnh493V4dIh4eXh1h4kJUI" />')
    expect(xml).toContain('<img src="/b.png" alt="乙" width="640" height="480" />')
    expect(xml).toContain('<img src="/c.png" alt="丙" />')
  })

  it('come back as they were, the sizes as numbers', () => {
    const [back] = read(write(gallery([FULL, SIZED, BARE])))
    expect(back.images).toEqual([FULL, SIZED, BARE])
    expect(typeof back.images[0].width).toBe('number')
    expect('width' in back.images[2]).toBe(false)
    expect('thumbhash' in back.images[1]).toBe(false)
  })

  it('travel with a file id and leave the gallery\'s own settings alone', () => {
    const before = {
      ...gallery([
        { ...FULL, fileId: 'file-a' },
        BARE,
      ]),
      layout: 'carousel',
      aspect: '4:3',
    }
    const [back] = read(write(before))
    expect(back.images[0]).toEqual({ ...FULL, fileId: 'file-a' })
    expect(back.layout).toBe('carousel')
    expect(back.aspect).toBe('4:3')
  })

  it('leave a gallery without them written exactly as before', () => {
    expect(write(gallery([BARE]))).toContain('<gallery id="g1" layout="grid"><img src="/c.png" alt="丙" /></gallery>')
  })

  it('are left out when what is written is no size at all', () => {
    const [back] = read([
      '<gallery layout="grid">',
      '<img src="/a.png" width="abc" height="0" />',
      '<img src="/b.png" width="-5" height="12.5" thumbhash="" />',
      '<img src="/c.png" width="300" height="200" />',
      '</gallery>',
    ].join(''))
    expect(back.images.map((item: any) => Object.keys(item).filter(key => key !== 'alt').sort())).toEqual([
      ['src'],
      ['src'],
      ['height', 'src', 'width'],
    ])
    expect(back.images[2]).toMatchObject({ width: 300, height: 200 })
  })
})
