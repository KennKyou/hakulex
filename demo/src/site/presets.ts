import type { SerializedEditorState } from 'lexical'
import type { SerializedNode } from './samples/helpers'
import { nodeTypes } from './nodes'
import { doc, element, FORMAT, paragraph, say, text } from './samples/helpers'

/* Documents that read like real ones. Plain data, so that E2E can import the list. */

export interface Preset {
  id: string
  label: string
  description: string
  data: SerializedEditorState
}

function heading(tag: string, value: string) {
  return element('heading', [
    text(value),
  ], { tag })
}
function quote(value: string) {
  return element('quote', [
    text(value),
  ])
}
function item(value: string, index: number, extra: SerializedNode = {}) {
  return element('listitem', [
    text(value),
  ], { value: index + 1, ...extra })
}
const steps = (...values: string[]) => element('list', values.map((value, index) => item(value, index)), { listType: 'number', start: 1, tag: 'ol' })
function todo(...values: [string, boolean][]) {
  return element('list', values.map(([value, checked], index) => item(value, index, { checked })), {
    listType: 'check',
    start: 1,
    tag: 'ul',
  })
}
const alert = (alertType: string, value: string) => element('alert-quote', say(value), { alertType })
function code(language: string, value: string): SerializedNode {
  return {
    type: 'code-block',
    version: 1,
    language,
    code: value,
  }
}

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
function table(head: string[], ...body: string[][]) {
  return element('table', [
    element('tablerow', head.map(value => cell(value, 1))),
    ...body.map(row => element('tablerow', row.map(value => cell(value)))),
  ])
}

function image(src: string, altText: string, extra: SerializedNode = {}): SerializedNode {
  return {
    type: 'image',
    version: 1,
    src,
    altText,
    width: 800,
    height: 600,
    ...extra,
  }
}

/** The first sample of every node, under its name. */
function allNodes(): SerializedEditorState {
  return doc(
    ...nodeTypes.flatMap((node) => {
      const { root } = node.samples[0].data as unknown as { root: { children: SerializedNode[] } }
      return [
        heading('h2', node.label),
        ...root.children,
      ]
    }),
  )
}

const prose = '文字會沿著圖片的邊緣排列，到了圖片下方才回到整行的寬度，適合放在說明性的段落旁邊。'.repeat(5)

export const presets: Preset[] = [
  {
    id: 'all-nodes',
    label: '所有節點',
    description: '每種節點各一個範例，放在同一份文件裡。',
    data: allNodes(),
  },
  {
    id: 'tech-article',
    label: '技術文章',
    description: '有程式碼、表格、公式和流程圖的技術文章。',
    data: doc(
      heading('h1', '在瀏覽器裡排版一份文件'),
      paragraph(
        text('編輯器和閱讀頁看起來要一樣，但兩邊的限制不同：編輯器要回應每一次按鍵，閱讀頁要'),
        text('快', FORMAT.bold),
        text('，還要能在伺服器上輸出。'),
      ),
      alert('note', '這篇文章的數字都是示意，用來展示排版。'),
      heading('h2', '同一份資料，兩條路'),
      paragraph(text('文件存成 JSON。編輯時交給 Lexical，閱讀時直接把 JSON 轉成元件，不需要載入編輯器。')),
      { type: 'mermaid', version: 1, diagram: 'graph LR\n  J[文件 JSON] --> E[編輯器]\n  J --> R[呈現]\n  R --> H[HTML]' },
      code('typescript', 'import { RichRenderer } from \'@hakulex/renderer\'\n\nconst html = await renderToString(h(RichRenderer, { value }))'),
      heading('h2', '要載入多少'),
      table(['情境', '需要 Lexical', '可以在伺服器執行'], ['編輯', '是', '否'], ['閱讀', '否', '是'], ['轉 Markdown', '是', '是']),
      paragraph(
        text('版面的行高可以用 '),
        { type: 'katex-inline', version: 1, equation: 'L = 1.6 \\times S' },
        text(' 估算，'),
        { type: 'footnote', version: 1, identifier: '1' },
        text('實際數值由 token 決定。'),
      ),
      heading('h2', '動手之前'),
      steps('確認文件的格式', '決定哪些區塊要能編輯', '再來處理效能'),
      quote('先讓它能動，再讓它正確，最後才讓它快。'),
      {
        type: 'footnote-section',
        version: 1,
        definitions: { 1: '常見的中文內文行高約在 1.6 到 1.8 之間。' },
      },
    ),
  },
  {
    id: 'notes',
    label: '生活筆記',
    description: '短段落、待辦、標籤和圖片組成的日常筆記。',
    data: doc(
      heading('h1', '週末的筆記'),
      paragraph(
        { type: 'tag', version: 1, text: '日常' },
        text(' '),
        { type: 'tag', version: 1, text: '散步' },
      ),
      ...say('早上下了一點雨，出門的時候路面還是濕的。', '河堤邊的咖啡店換了菜單，拿鐵比以前淡一些，但是甜點變好吃了。'),
      image('/samples/photo-2.jpg', '傍晚的天空', { caption: '傍晚的天空' }),
      paragraph(
        text('朋友說那部電影的結局是 '),
        element('spoiler', [
          text('一切都是夢'),
        ]),
        text('，幸好我已經看過了。'),
      ),
      paragraph(
        text('今天學到一個詞：'),
        element('ruby', [
          text('木漏れ日'),
        ], { reading: 'こもれび' }),
        text('，指從樹葉間灑下來的陽光。'),
      ),
      quote('慢慢走，也是一種抵達。'),
      heading('h2', '下週要做的事'),
      todo(['換掉廚房的燈泡', true], ['回覆房東的訊息', true], ['把書還給圖書館', false]),
    ),
  },
  {
    id: 'image-wrap',
    label: '圖片繞排',
    description: '圖片靠左、靠右和不同寬度時的文繞圖。',
    data: doc(
      heading('h1', '圖片和文字一起排'),
      image('/samples/photo-1.jpg', '靠左的圖片', { layout: 'float-left' }),
      paragraph(text(prose)),
      image('/samples/photo-3.jpg', '靠右的圖片', { layout: 'float-right', displayWidth: 30, caption: '靠右，寬度 30%' }),
      paragraph(text(prose)),
      heading('h2', '一般的置中圖片'),
      image('/samples/photo-2.jpg', '置中的圖片'),
      paragraph(text('沒有設定繞排時，圖片自己佔一行。')),
    ),
  },
]

export const findPreset = (id: unknown) => presets.find(preset => preset.id === id)
