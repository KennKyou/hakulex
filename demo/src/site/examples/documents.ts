import type { SerializedEditorState } from 'lexical'

/* The documents the examples start from: a stand-in for what you load from your own storage. */

type Json = Record<string, unknown>

function element(type: string, children: Json[], extra: Json = {}): Json {
  return {
    type,
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children,
    ...extra,
  }
}
function text(value: string, format = 0): Json {
  return {
    type: 'text',
    version: 1,
    detail: 0,
    format,
    mode: 'normal',
    style: '',
    text: value,
  }
}
const paragraph = (...children: Json[]) => element('paragraph', children, { textFormat: 0, textStyle: '' })
function doc(...children: Json[]) {
  return ({
    root: element('root', children),
  }) as unknown as SerializedEditorState
}

export const article = doc(
  element('heading', [
    text('發布前的檢查'),
  ], { tag: 'h1' }),
  paragraph(text('這篇是'), text('草稿', 1), text('，週五前要改完。')),
  element('quote', [
    text('先讓它能動，再讓它正確。'),
  ]),
)

export const paragraphs = doc(
  paragraph(text('第一段：選取這段文字試試看。')),
  paragraph(text('第二段：每個區塊都有自己的把手。')),
  paragraph(text('第三段：可以把它拖到別的位置。')),
)

export const withLink = doc(
  paragraph(
    text('前往 '),
    element('link', [
      text('Lexical 官方網站'),
    ], {
      url: 'https://lexical.dev',
      rel: 'noopener noreferrer',
      target: '_blank',
      title: null,
    }),
    text(' 了解更多。'),
  ),
)

function cell(value: string, headerState = 0) {
  return element('tablecell', [
    paragraph(text(value)),
  ], {
    backgroundColor: null,
    colSpan: 1,
    headerState,
    rowSpan: 1,
  })
}

export const withTable = doc(
  element('table', [
    element('tablerow', [
      cell('套件', 1),
      cell('用途', 1),
    ]),
    element('tablerow', [
      cell('editor'),
      cell('編輯'),
    ]),
    element('tablerow', [
      cell('renderer'),
      cell('呈現'),
    ]),
  ]),
)

export const revised = doc(
  element('heading', [
    text('發布前的檢查'),
  ], { tag: 'h1' }),
  paragraph(text('這篇已經'), text('定稿', 1), text('，今天就能發布。')),
  element('quote', [
    text('先讓它能動，再讓它正確。'),
  ]),
  paragraph(text('最後補上一段結語。')),
)
