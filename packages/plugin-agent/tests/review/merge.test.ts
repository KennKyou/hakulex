import type { SerializedLexicalNode } from 'lexical'
import { DELETE_MARK_STYLE, INSERT_MARK_STYLE } from '@hakulex/diff-core'
import { describe, expect, it } from 'vitest'
import { mergeText } from '../../src/review/merge'

type Json = Record<string, any>

function text(value: string, format = 0, style = ''): Json {
  return {
    type: 'text',
    text: value,
    format,
    detail: 0,
    mode: 'normal',
    style,
    version: 1,
  }
}
function paragraph(...children: Json[]) {
  return ({
    type: 'paragraph',
    children,
    direction: null,
    format: '',
    indent: 0,
    version: 1,
    $: { blockId: 'b' },
  }) as unknown as SerializedLexicalNode
}

/** The merged block as `=same`, `+added`, `-removed` pieces. */
function read(node: SerializedLexicalNode | null) {
  return ((node as Json | null)?.children ?? []).map((child: Json) =>
    `${child.style.includes(DELETE_MARK_STYLE)
      ? '-'
      : child.style.includes(INSERT_MARK_STYLE)
        ? '+'
        : '='}${child.text}`)
}

describe('mergeText', () => {
  it('keeps what both have once, strikes what went and marks what came', () => {
    const merged = mergeText(paragraph(text('這篇是草稿，週五前要改完。')), paragraph(text('這篇已經定稿，今天就能發布。')))
    expect(read(merged).join('|')).toBe('=這篇|-是草|+已經定|=稿，|-週五前要改完|+今天就能發布|=。')
    expect((merged as Json).$).toEqual({ blockId: 'b' })
  })

  it('compares across the runs, so that one word made bold is one word changed', () => {
    const merged = mergeText(paragraph(text('第二段的文字')), paragraph(text('第二段的'), text('新', 1), text('文字')))
    expect(read(merged)).toEqual(['=第二段的', '+新', '=文字'])
    expect(((merged as Json).children as Json[]).map(child => child.format)).toEqual([0, 1, 0])

    // The same letters in another format show as changed, once, with the new format.
    const bolder = mergeText(paragraph(text('很重要的事')), paragraph(text('很'), text('重要', 1), text('的事')))
    expect(read(bolder)).toEqual(['=很', '+重要', '=的事'])
    expect(((bolder as Json).children as Json[])[1].format).toBe(1)
  })

  it('keeps each piece in the format and style it had in its own version', () => {
    const merged = mergeText(
      paragraph(text('粗體', 1), text('後面')),
      paragraph(text('斜體', 2, 'color: red;'), text('後面')),
    )
    const children = (merged as Json).children as Json[]
    expect(read(merged)).toEqual(['-粗', '+斜體', '=後面'])
    expect(children.map(child => child.format)).toEqual([1, 2, 0])
    expect(children[1].style).toContain('color: red;')
  })

  it('handles text that is only added to, only cut, emptied or filled', () => {
    expect(read(mergeText(paragraph(text('前面')), paragraph(text('前面再加一句'))))).toEqual(['=前面', '+再加一句'])
    expect(read(mergeText(paragraph(text('前面再加一句')), paragraph(text('前面'))))).toEqual(['=前面', '-再加一句'])
    expect(read(mergeText(paragraph(text('全部刪掉')), paragraph()))).toEqual(['-全部刪掉'])
    expect(read(mergeText(paragraph(), paragraph(text('全部新增'))))).toEqual(['+全部新增'])
    expect(read(mergeText(paragraph(text('一樣')), paragraph(text('一樣'))))).toEqual(['=一樣'])
  })

  it('does not cut a character outside the basic plane in half', () => {
    expect(read(mergeText(paragraph(text('好😀的')), paragraph(text('好🎉的'))))).toEqual(['=好', '-😀', '+🎉', '=的'])
  })

  it('leaves blocks with more than plain text, and very long ones, to the node-by-node comparison', () => {
    const link = {
      type: 'link',
      url: 'https://example.com',
      children: [
        text('連結'),
      ],
      version: 1,
    }
    expect(mergeText(paragraph(text('前'), link), paragraph(text('後'), link))).toBeNull()
    expect(mergeText(paragraph(text('a'.repeat(4001))), paragraph(text('b')))).toBeNull()
  })
})
