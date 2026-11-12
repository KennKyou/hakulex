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
    const merged = mergeText(paragraph(text('這篇文章是草稿，預計週五前改完。')), paragraph(text('這篇文章是初稿，預計週四前改完。')))
    expect(read(merged).join('|')).toBe('=這篇文章是|-草|+初|=稿，預計週|-五|+四|=前改完。')
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

const LONG = '大家好，首先非常感謝各位一直以來對讀書會的支持與參與，在這邊想要跟大家宣布一個消息，那就是我們預計將會在十二月的時候舉辦今年度的最後一場讀書會活動。'
const CUT = '大家好，我們預計在十二月舉辦今年最後一場讀書會。'

describe('mergeText, kept readable', () => {
  const pieces = (node: SerializedLexicalNode | null | 'apart', sign: string) =>
    read(node as SerializedLexicalNode).filter((piece: string) => piece.startsWith(sign)).map((piece: string) => piece.slice(1)).join('')

  it('shows words that were only cut as strike-throughs, with nothing marked as new', () => {
    const merged = mergeText(paragraph(text(LONG)), paragraph(text(CUT)))
    expect(merged).not.toBe('apart')
    expect(pieces(merged, '+')).toBe('')
    expect(pieces(merged, '=')).toBe(CUT)
    expect(read(merged as SerializedLexicalNode).map((piece: string) => piece.slice(1)).join('')).toBe(LONG)
    // Short shared pieces between two cuts stay as they are: nothing is struck and put back.
    expect(read(mergeText(paragraph(text('大家一起來聊一聊')), paragraph(text('大家一起聊聊'))))).toEqual(['=大家一起', '-來', '=聊', '-一', '=聊'])
  })

  it('shows words that were only added as marked, with nothing struck', () => {
    const merged = mergeText(paragraph(text(CUT)), paragraph(text(LONG)))
    expect(merged).not.toBe('apart')
    expect(pieces(merged, '-')).toBe('')
    expect(pieces(merged, '=')).toBe(CUT)
  })

  it('takes a stray shared letter between two changes into the change: old words, then new ones', () => {
    const merged = mergeText(
      paragraph(text('感謝各位一直以來對讀書會的支持，我們很高興。')),
      paragraph(text('感謝各位今年最後一場讀書會的支持，我們很高興。')),
    )
    expect(read(merged as SerializedLexicalNode).join('|')).toBe('=感謝各位|-一直以來對|+今年最後一場|=讀書會的支持，我們很高興。')
  })

  it('puts what went before what came where several changes run together', () => {
    const merged = mergeText(paragraph(text('我們預計將會在下個月的時候舉辦活動。')), paragraph(text('我們決定於十二月初舉辦活動。')))
    const signs = read(merged as SerializedLexicalNode).map((piece: string) => piece[0]).join('')
    expect(signs).not.toMatch(/\+-/)
  })

  it('says a block that was mostly rewritten is to be shown apart, not merged', () => {
    expect(mergeText(paragraph(text(LONG)), paragraph(text('大家好，今年最後一場讀書會將在十二月舉辦。')))).toBe('apart')
    expect(mergeText(paragraph(text('這篇是草稿，週五前要改完。')), paragraph(text('完全不同的另一句話，沒有關係。')))).toBe('apart')
    // A fifth of the letters shared is still read as one; less is not.
    expect(mergeText(paragraph(text('甲乙丙丁戊己庚辛壬癸')), paragraph(text('甲乙子丑寅卯辰巳午未')))).not.toBe('apart')
    expect(mergeText(paragraph(text('甲乙丙丁戊己庚辛壬癸')), paragraph(text('甲丑子丑寅卯辰巳午未')))).toBe('apart')
    // A short sentence with new words in the middle reads well merged.
    expect(read(mergeText(paragraph(text('這篇是草稿，週五前要改完。')), paragraph(text('這篇已經定稿，今天就能發布。'))) as SerializedLexicalNode).join('|'))
      .toBe('=這篇|-是草稿，週五前要改完|+已經定稿，今天就能發布|=。')
    // Cutting or adding a lot is not rewriting: it stays one block.
    expect(read(mergeText(paragraph(text('留下這句。其餘的字全部都要刪掉不留。')), paragraph(text('留下這句。'))) as SerializedLexicalNode)).toEqual(['=留下這句。', '-其餘的字全部都要刪掉不留。'])
  })
})
