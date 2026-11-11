import type { SerializedEditorState } from 'lexical'

import { describe, expect, it } from 'vitest'
import { createDefaultRegistry } from '../src/default-registry'
import { deserializeFromXml } from '../src/deserializer'
import { LitexmlRegistry } from '../src/registry'
import { serializeToXml } from '../src/serializer'
import '../src/index-browser'

describe('litexmlRegistry', () => {
  it('registers and retrieves a writer', () => {
    const registry = new LitexmlRegistry()
    const writer = () => false as const
    registry.registerWriter('paragraph', writer)
    expect(registry.getWriter('paragraph')).toBe(writer)
  })

  it('registers and retrieves a reader', () => {
    const registry = new LitexmlRegistry()
    const reader = () => false as const
    registry.registerReader('p', reader)
    expect(registry.getReader('p')).toBe(reader)
  })

  it('returns undefined for unregistered types', () => {
    const registry = new LitexmlRegistry()
    expect(registry.getWriter('unknown')).toBeUndefined()
    expect(registry.getReader('unknown')).toBeUndefined()
  })

  it('reader lookup is case-insensitive', () => {
    const registry = new LitexmlRegistry()
    const reader = () => false as const
    registry.registerReader('P', reader)
    expect(registry.getReader('p')).toBe(reader)
    expect(registry.getReader('P')).toBe(reader)
  })
})

describe('a site\'s own writers and readers', () => {
  it('replace the defaults, add tags, and fall back to <node> when a writer passes', () => {
    const registry = createDefaultRegistry()
    registry.registerWriter('image', node => ({
      tag: 'picture',
      attrs: { src: (node as any).src },
      selfClosing: true,
    }))
    registry.registerWriter('video', () => false)
    registry.registerReader('widget', el => ({
      type: 'widget',
      name: el.getAttribute('name'),
      version: 1,
    }) as any)
    const state = {
      root: {
        type: 'root',
        children: [
          {
            type: 'image',
            src: 'a.png',
            altText: '',
            version: 1,
          },
          { type: 'video', src: 'v.mp4', version: 1 },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
      },
    } as unknown as SerializedEditorState
    const xml = serializeToXml(state, registry, { compact: true })
    expect(xml).toBe('<doc><picture src="a.png" /><node type="video" data="{&quot;src&quot;:&quot;v.mp4&quot;}" /></doc>')
    const back = (deserializeFromXml('<doc><widget name="w" /><p>after</p></doc>', registry).root as any).children
    expect(back.map((node: any) => node.type)).toEqual(['widget', 'paragraph'])
    expect(back[0].name).toBe('w')
  })
})
