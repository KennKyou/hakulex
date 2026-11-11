import type { SerializedEditorState } from 'lexical'
import { DELETE_MARK_STYLE, INSERT_MARK_STYLE } from '@hakulex/diff-core'
import { renderToString } from '@vue/server-renderer'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { RichDiff } from '../src'

afterEach(() => {
  document.body.innerHTML = ''
})

function text(value: string) {
  return {
    type: 'text',
    text: value,
    format: 0,
    detail: 0,
    mode: 'normal',
    style: '',
    version: 1,
  }
}
function paragraph(value: string) {
  return {
    type: 'paragraph',
    children: [
      text(value),
    ],
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
    textFormat: 0,
    textStyle: '',
  }
}
function heading(tag: string, value: string) {
  return {
    type: 'heading',
    tag,
    children: [
      text(value),
    ],
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  }
}
function quote(value: string) {
  return {
    type: 'quote',
    children: [
      text(value),
    ],
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  }
}
function doc(...children: unknown[]) {
  return ({
    root: {
      type: 'root',
      children,
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  }) as unknown as SerializedEditorState
}

// Two versions of a document: a paragraph edited, a heading gone, a quote added.
const OLD = doc(paragraph('甲'), paragraph('Hello world'), heading('h3', '丙'), paragraph('丁'))
const NEW = doc(paragraph('甲'), paragraph('Hello there world'), paragraph('丁'), quote('戊'))

const cellText = (cell: Element | undefined) => cell?.querySelector('.hlx-renderer')?.textContent ?? ''

describe('richDiff side by side', () => {
  it('shows the old and new versions in rows, marking what was removed and added', () => {
    const wrapper = mount(RichDiff, {
      props: { oldValue: OLD, newValue: NEW },
      attachTo: document.body,
    })
    const root = wrapper.element as HTMLElement
    expect([
      ...root.querySelectorAll('.hlx-diff-header > *'),
    ].map(cell => cell.textContent?.trim())).toEqual(['舊版', '新版'])
    const rows = [
      ...root.querySelectorAll('.hlx-diff-row'),
    ].map(row => [...row.children])
    expect(rows.map(([left, right]) => [
      left.getAttribute('data-diff-type'),
      right.getAttribute('data-diff-type'),
    ])).toEqual([
      ['equal', 'equal'],
      ['delete', 'insert'],
      ['delete', 'empty'],
      ['equal', 'equal'],
      ['empty', 'insert'],
    ])
    expect(rows.map(([left, right]) => [
      cellText(left),
      cellText(right),
    ])).toEqual([
      ['甲', '甲'],
      ['Hello world', 'Hello there world'],
      ['丙', ''],
      ['丁', '丁'],
      ['', '戊'],
    ])
    // The character marks come through the text's own style; happy-dom can't parse color-mix()
    // and empties it, so the style itself is checked in the server render below.
    expect([
      ...rows[1][1].querySelectorAll('span[style]'),
    ].map(span => span.textContent)).toEqual(['there '])
    expect(rows[1][0].querySelectorAll('span[style]')).toHaveLength(0)
    // Blocks look as the renderer draws them, without heading anchors.
    const removedHeading = rows[2][0].querySelector('h3')!
    expect(removedHeading.classList).toContain('hlx-h3')
    expect(removedHeading.hasAttribute('id')).toBe(false)
    expect(rows[2][0].querySelector('h3 span[style]')!.textContent).toBe('丙')
  })
})

describe('richDiff in one column', () => {
  const ten = (changed: string) => doc(...Array.from({ length: 10 }, (_, i) => paragraph(i === 4
    ? changed
    : `第 ${i + 1} 段`)))

  it('merges a changed block and folds long unchanged runs, keeping one block each side', () => {
    const wrapper = mount(RichDiff, {
      props: {
        oldValue: ten('第 5 段'),
        newValue: ten('第 5 段改過'),
        layout: 'inline',
        collapseUnchanged: true,
      },
      attachTo: document.body,
    })
    const parts = [
      ...wrapper.element.querySelectorAll('.hlx-diff-body > *'),
    ].map(part => part.classList.contains('hlx-diff-collapsed')
      ? `…${part.textContent?.trim()}`
      : `${part.getAttribute('data-diff-type')}:${cellText(part)}`)
    // : no block kept on the side of the document's start or end.
    expect(parts).toEqual([
      '…3 個未變更的區塊',
      'equal:第 4 段',
      'modify:第 5 段改過',
      'equal:第 6 段',
      '…4 個未變更的區塊',
    ])
    expect(wrapper.element.querySelector('[data-diff-type="modify"] span[style]')!.textContent).toBe('改過')
  })

  it('shows every block without collapse-unchanged, and the site\'s own words in the slot', () => {
    const all = mount(RichDiff, {
      props: {
        oldValue: ten('第 5 段'),
        newValue: ten('改'),
        layout: 'inline',
      },
    })
    expect(all.element.querySelectorAll('.hlx-diff-collapsed')).toHaveLength(0)
    expect(all.element.querySelectorAll('.hlx-diff-body > *').length).toBeGreaterThanOrEqual(3)

    const own = mount(RichDiff, {
      props: {
        oldValue: ten('第 5 段'),
        newValue: ten('改'),
        layout: 'inline',
        collapseUnchanged: true,
      },
      slots: {
        collapsed: ({ count }: { count: number }) => `略過 ${count} 段`,
      },
    })
    expect([
      ...own.element.querySelectorAll('.hlx-diff-collapsed'),
    ].map(part => part.textContent?.trim())).toEqual(['略過 3 段', '略過 4 段'])
  })
})

describe('richDiff themes and the server', () => {
  const props = {
    oldValue: OLD,
    newValue: NEW,
    variant: 'comment',
    colorScheme: 'dark',
    theme: {
      color: { accent: '#ff0066' },
    },
  } as const

  it('follows the variant, color scheme and theme', () => {
    const wrapper = mount(RichDiff, { props })
    const root = wrapper.element as HTMLElement
    expect(root.classList).toContain('hlx-root')
    expect(root.classList).toContain('hlx-diff')
    expect(root.dataset.variant).toBe('comment')
    expect(root.dataset.colorScheme).toBe('dark')
    expect(root.getAttribute('style')).toContain('#ff0066')
    for (const renderer of root.querySelectorAll('.hlx-renderer')) {
      expect(renderer.getAttribute('data-variant')).toBe('comment')
      expect(renderer.getAttribute('data-color-scheme')).toBe('dark')
    }
  })

  it('renders on the server', async () => {
    const html = await renderToString(createSSRApp({
      render: () => h(RichDiff, props),
    }))
    expect(html).toContain('data-diff-type="delete"')
    expect(html).toContain('data-diff-type="insert"')
    expect(html).toContain(`style="${INSERT_MARK_STYLE}">there </span>`)
    expect(html).toContain(`style="${DELETE_MARK_STYLE}">丙</span>`)
    expect(html).toContain('舊版')
  })
})
