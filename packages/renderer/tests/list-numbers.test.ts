import type { SerializedDocument, SerializedNode } from '../src'
import { renderToString } from '@vue/server-renderer'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { RichRenderer } from '../src'

/*
 * An item's `value` is written only when it's above 1. LiteXML gives
 * every item a value of 1; written as it is, an ordered list reads 1, 1, 1.
 */

const text = (value: string): SerializedNode => ({ type: 'text', text: value, format: 0 })
function item(label: string, extra: Record<string, unknown> = {}): SerializedNode {
  return {
    type: 'listitem',
    children: [
      text(label),
    ],
    ...extra,
  }
}
function list(listType: string, items: SerializedNode[], extra: Record<string, unknown> = {}): SerializedNode {
  return {
    type: 'list',
    listType,
    children: items,
    ...extra,
  }
}
function doc(...children: SerializedNode[]): SerializedDocument {
  return {
    root: { type: 'root', children },
  }
}

async function ssr(value: SerializedDocument) {
  return renderToString(createSSRApp({
    render: () => h(RichRenderer, { value }),
  }))
}

describe('list item numbers', () => {
  const allOnes = doc(
    list('number', [
      item('一', { value: 1 }),
      item('二', { value: 1 }),
      item('三', { value: 1 }),
    ], { start: 1, tag: 'ol' }),
    list('bullet', [
      item('甲', { value: 1 }),
      item('乙', { value: 1 }),
    ], { tag: 'ul' }),
    list('check', [
      item('做', { value: 1, checked: true }),
      item('沒做', { value: 1, checked: false }),
    ], { tag: 'ul' }),
  )

  it('leaves out value 1, so an ordered list counts on (server)', async () => {
    const html = await ssr(allOnes)
    expect(html).not.toContain('value=')
    expect(html).toContain('<ol class="hlx-list hlx-ol" dir="auto"><li class="hlx-listitem">一</li><li class="hlx-listitem">二</li><li class="hlx-listitem">三</li></ol>')
    expect(html).toContain('<li class="hlx-listitem hlx-listitem-checked" role="checkbox" aria-checked="true" aria-readonly="true">做</li>')
  })

  it('leaves out value 1 in the browser too, where the list reads 1, 2, 3', () => {
    const wrapper = mount(RichRenderer, {
      props: { value: allOnes },
    })
    const items = wrapper.findAll('ol > li')
    expect(items.map(li => li.text())).toEqual(['一', '二', '三'])
    expect(items.map(li => li.attributes('value'))).toEqual([undefined, undefined, undefined])
  })

  it('keeps values above 1 and the list\'s start, and drops values that aren\'t numbers', async () => {
    const html = await ssr(doc(
      list('number', [
        item('三', { value: 3 }),
        item('四', { value: 4 }),
      ], { start: 3, tag: 'ol' }),
      list('number', [
        item('a', { value: 1 }),
        item('b', { value: 2 }),
        item('c'),
        item('d', { value: '5' }),
      ], { tag: 'ol' }),
    ))
    expect(html).toContain('<ol class="hlx-list hlx-ol" dir="auto" start="3"><li class="hlx-listitem" value="3">三</li><li class="hlx-listitem" value="4">四</li></ol>')
    expect(html).toContain('<li class="hlx-listitem">a</li><li class="hlx-listitem" value="2">b</li><li class="hlx-listitem">c</li><li class="hlx-listitem">d</li>')
  })
})
