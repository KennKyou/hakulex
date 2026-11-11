import type { SerializedNode } from '../src'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { RichRenderer, safeCommentText, tagHue } from '../src'

const text = (value: string): SerializedNode => ({ type: 'text', text: value, format: 0 })
const paragraph = (...children: SerializedNode[]): SerializedNode => ({ type: 'paragraph', children })
function tag(value: unknown, format = 0): SerializedNode {
  return {
    type: 'tag',
    text: value,
    format,
    version: 1,
  }
}
function comment(value: unknown): SerializedNode {
  return {
    type: 'comment',
    text: value,
    format: 0,
    version: 1,
  }
}

async function ssr(...children: SerializedNode[]) {
  const value = {
    root: { type: 'root', children },
  }
  const html = await renderToString(createSSRApp({
    render: () => h(RichRenderer, { value }),
  }))
  return html.replace(/<!--\[-->|<!--\]-->|<!---->/g, '')
}

function parsed(html: string) {
  const container = document.createElement('div')
  container.innerHTML = html
  return container
}

describe('tag', () => {
  it('shows its text with a hue that comes from the text', async () => {
    const html = await ssr(paragraph(tag('甲')))
    const element = parsed(html).querySelector<HTMLElement>('.hlx-tag')!
    expect(element.textContent).toBe('甲')
    expect(element.getAttribute('style')).toBe(`--hlx-tag-hue:${tagHue('甲')};`)
  })

  it('has a whole hue from 0 to 359, the same for the same text', () => {
    for (const value of [
      '',
      'a',
      '標籤',
      '很長的文字'.repeat(100),
      '😀',
    ]) {
      const hue = tagHue(value)
      expect(Number.isInteger(hue)).toBe(true)
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(360)
      expect(tagHue(value)).toBe(hue)
    }
    expect(tagHue('甲')).not.toBe(tagHue('乙'))
  })

  it('shows HTML as text', async () => {
    const element = parsed(await ssr(paragraph(tag('<img src=x onerror=a()>')))).querySelector('.hlx-tag')!
    expect(element.querySelector('img')).toBeNull()
    expect(element.textContent).toBe('<img src=x onerror=a()>')
  })

  it.each([
    ['blank', '  '],
    ['empty', ''],
    ['a number', 3],
    ['missing', undefined],
  ])('outputs nothing when its text is %s', async (_name, value) => {
    expect(parsed(await ssr(paragraph(tag(value)))).querySelector('.hlx-tag')).toBeNull()
  })

  it('keeps its format', async () => {
    const element = parsed(await ssr(paragraph(tag('粗', 1)))).querySelector('.hlx-tag')!
    expect(element.querySelector('strong')?.textContent).toBe('粗')
  })
})

describe('comment', () => {
  it('outputs a real HTML comment, which readers do not see', async () => {
    const html = await ssr(paragraph(text('前'), comment('筆記'), text('後')))
    expect(html).toContain('<!--筆記-->')
    expect(parsed(html).textContent).toBe('前後')
  })

  it.each([
    'a-->b',
    'a--!>b',
    '-->',
    '->x',
    '>x',
    'x<!-',
    'a---->b',
    '<script>bad()</script>-->',
    '--><img src=x onerror=a()>',
  ])('keeps %s inside the comment', async (value) => {
    const container = parsed(await ssr(paragraph(text('前'), comment(value), text('後'))))
    expect(container.textContent).toBe('前後')
    expect(container.querySelector('img,script')).toBeNull()
    const inner = safeCommentText(value)
    expect(inner).not.toMatch(/^-?>|--|<!-$/)
  })

  it('leaves ordinary text alone', () => {
    expect(safeCommentText('普通的 - 註解 > 內容')).toBe('普通的 - 註解 > 內容')
  })

  it.each([
    ['a number', 3],
    ['missing', undefined],
    ['empty', ''],
  ])('outputs nothing when its text is %s', async (_name, value) => {
    expect(await ssr(paragraph(text('字'), comment(value)))).toBe(await ssr(paragraph(text('字'))))
  })

  it('stays out of heading ids', async () => {
    const heading = (...children: SerializedNode[]): SerializedNode => ({ type: 'heading', tag: 'h2', children })
    const id = (html: string) => parsed(html).querySelector('h2')!.id
    expect(id(await ssr(heading(text('標題'), comment('筆記'))))).toBe(id(await ssr(heading(text('標題')))))
  })
})

describe('rich quote', () => {
  const quote = (attribution: unknown, ...children: SerializedNode[]): SerializedNode => ({ type: 'rich-quote', attribution, children })

  it('ends with who said it', async () => {
    const element = parsed(await ssr(quote('魯迅', paragraph(text('內文'))))).querySelector('blockquote')!
    expect(element.classList.contains('hlx-quote')).toBe(true)
    expect(element.querySelector('p')!.textContent).toBe('內文')
    expect(element.lastElementChild!.tagName).toBe('FOOTER')
    expect(element.lastElementChild!.textContent).toBe('— 魯迅')
  })

  it('takes text children like a plain quote', async () => {
    const element = parsed(await ssr(quote('魯迅', text('內文')))).querySelector('blockquote')!
    expect(element.textContent).toBe('內文— 魯迅')
  })

  it('trims it', async () => {
    expect(parsed(await ssr(quote('  魯迅 ', text('字')))).querySelector('footer')!.textContent).toBe('— 魯迅')
  })

  it('shows HTML as text', async () => {
    const footer = parsed(await ssr(quote('<img src=x>', text('字')))).querySelector('footer')!
    expect(footer.querySelector('img')).toBeNull()
    expect(footer.textContent).toBe('— <img src=x>')
  })

  it.each([
    ['null', null],
    ['blank', '  '],
    ['empty', ''],
    ['a number', 3],
    ['missing', undefined],
  ])('has no footer when it is %s', async (_name, value) => {
    const element = parsed(await ssr(quote(value, text('字')))).querySelector('blockquote')!
    expect(element.textContent).toBe('字')
    expect(element.querySelector('footer')).toBeNull()
  })
})
