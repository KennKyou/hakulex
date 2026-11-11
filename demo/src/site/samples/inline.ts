import { defineNodes, element, FORMAT, paragraph, sample, text } from './helpers'

export const inlineNodes = defineNodes('inline', [
  {
    type: 'text',
    label: '文字格式',
    description: '段落裡的文字和它的樣式：粗體、斜體、底線、刪除線、行內程式碼、螢光標記和上下標。',
    samples: [
      sample('text', '文字格式', paragraph(
        text('一般文字、'),
        text('粗體', FORMAT.bold),
        text('、'),
        text('斜體', FORMAT.italic),
        text('、'),
        text('底線', FORMAT.underline),
        text('、'),
        text('刪除線', FORMAT.strikethrough),
        text('、'),
        text('行內程式碼', FORMAT.code),
        text('、'),
        text('螢光標記', FORMAT.highlight),
        text('，還有 H'),
        text('2', FORMAT.subscript),
        text('O 和 x'),
        text('2', FORMAT.superscript),
        text('。'),
      )),
    ],
  },
  {
    type: 'link',
    label: '連結',
    description: '指向其他網址的文字。直接貼上或打出網址時會成為自動連結（autolink）。',
    samples: [
      sample('link', '連結', paragraph(
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
      )),
      sample('autolink', '自動連結', paragraph(
        text('網址 '),
        element('autolink', [
          text('https://lexical.dev'),
        ], {
          url: 'https://lexical.dev',
          isUnlinked: false,
          rel: 'noopener noreferrer',
          target: null,
          title: null,
        }),
        text(' 會自動變成連結。'),
      )),
    ],
  },
  {
    type: 'spoiler',
    label: '隱藏文字',
    description: '讀者點開之前都遮住的文字，Markdown 寫成 ||文字||。',
    samples: [
      sample('spoiler', '隱藏文字', paragraph(
        text('結局是 '),
        element('spoiler', [
          text('主角其實是兇手'),
        ]),
        text('，點一下才看得到。'),
      )),
    ],
  },
  {
    type: 'katex-inline',
    label: '行內公式',
    description: '段落裡由 KaTeX 排版的數學式。',
    samples: [
      sample('katex-inline', '行內公式', paragraph(
        text('質能等價寫成 '),
        { type: 'katex-inline', version: 1, equation: 'E = mc^2' },
        text('，是物理學最有名的式子。'),
      )),
    ],
  },
  {
    type: 'ruby',
    label: '注音',
    description: '文字上方標示讀音，例如日文的振假名或中文的注音。',
    samples: [
      sample('ruby', '注音', paragraph(
        text('這個詞念作 '),
        element('ruby', [
          text('漢字'),
        ], { reading: 'かんじ' }),
        text('。'),
      )),
    ],
  },
  {
    type: 'mention',
    label: '提及',
    description: '連到社群平台個人頁面的提及，會顯示平台的圖示。',
    samples: [
      sample('mention', '提及', paragraph(
        text('感謝 '),
        {
          type: 'mention',
          version: 1,
          platform: 'GH',
          handle: 'KennKyou',
          displayName: 'Ken',
        },
        text('。'),
      )),
    ],
  },
  {
    type: 'tag',
    label: '標籤',
    description: '放在文字中的小標籤，顏色由內容決定。',
    samples: [
      sample('tag', '標籤', paragraph(
        text('這篇文章屬於 '),
        { type: 'tag', version: 1, text: '前端' },
        text(' 和 '),
        { type: 'tag', version: 1, text: '編輯器' },
        text('。'),
      )),
    ],
  },
  {
    type: 'comment',
    label: 'HTML 註解',
    description: '在編輯器裡看得到、可以修改；呈現時輸出成真正的 HTML 註解，所以畫面上看不到。',
    samples: [
      sample('comment', 'HTML 註解', paragraph(
        text('註解在這句話的後面'),
        { type: 'comment', version: 1, text: '之後補上資料來源' },
        text('。'),
      )),
    ],
  },
  {
    type: 'footnote',
    label: '註腳',
    description: '文字裡的 [^1] 標記，連到文件尾端註腳區裡的內容。',
    samples: [
      sample(
        'footnote',
        '註腳',
        paragraph(
          text('Lexical 是 Meta 開源的編輯器框架'),
          { type: 'footnote', version: 1, identifier: '1' },
          text('。'),
        ),
        {
          type: 'footnote-section',
          version: 1,
          definitions: { 1: '官方網站是 lexical.dev。' },
        },
      ),
    ],
  },
])
