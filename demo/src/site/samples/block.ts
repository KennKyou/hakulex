import type { SerializedNode } from './helpers'
import { defineNodes, element, FORMAT, paragraph, sample, say, text } from './helpers'

function listItem(label: string, extra: SerializedNode = {}, children: SerializedNode[] = [
  text(label),
]) {
  return element('listitem', children, { value: 1, ...extra })
}

function list(listType: 'bullet' | 'number' | 'check', items: SerializedNode[]) {
  return element('list', items, {
    listType,
    start: 1,
    tag: listType === 'number'
      ? 'ol'
      : 'ul',
  })
}

function cell(label: string, headerState = 0) {
  return element('tablecell', [
    paragraph(text(label)),
  ], {
    backgroundColor: null,
    colSpan: 1,
    headerState,
    rowSpan: 1,
  })
}

function table(rows: string[][]) {
  return element('table', rows.map((row, index) => element('tablerow', row.map(label => cell(label, index === 0
    ? 1
    : 0)))))
}

const months = ['一月', '二月', '三月', '四月']
const visits = [320, 480, 410, 620]

function poll(pollId: string, question: string, options: [string, string][], extra: SerializedNode = {}): SerializedNode {
  return {
    type: 'poll',
    version: 1,
    pollId,
    question,
    options: options.map(([id, label]) => ({ id, label })),
    mode: 'single',
    ...extra,
  }
}

export const blockNodes = defineNodes('block', [
  {
    type: 'heading',
    label: '標題',
    description: '文件的章節標題，一到六級，呈現時有可以連結的錨點。',
    samples: [
      sample(
        'heading',
        '標題',
        ...['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((tag, index) => element('heading', [
          text(`第 ${index + 1} 級標題`),
        ], { tag })),
      ),
    ],
  },
  {
    type: 'quote',
    label: '引用',
    description: '引用一段文字，Markdown 寫成以 > 開頭。',
    samples: [
      sample('quote', '引用', element('quote', [
        text('好的程式碼本身就是最好的文件。'),
      ])),
    ],
  },
  {
    type: 'rich-quote',
    label: '富文本引用',
    description: '裡面可以放多個段落的引用，還能註明出處。',
    samples: [
      sample('rich-quote', '富文本引用', element('rich-quote', [
        paragraph(text('先讓它能動，', FORMAT.bold), text('再讓它正確，最後才讓它快。')),
        paragraph(text('順序不要反過來。')),
      ], { attribution: 'Kent Beck' })),
    ],
  },
  {
    type: 'list',
    label: '清單',
    description: '項目清單、編號清單和待辦清單，可以多層巢狀。',
    samples: [
      sample('list-bullet', '項目清單', list('bullet', [
        listItem('蘋果'),
        listItem('香蕉'),
        listItem('櫻桃'),
      ])),
      sample('list-number', '編號清單', list('number', [
        listItem('寫下需求', { value: 1 }),
        listItem('實作', { value: 2 }),
        listItem('驗收', { value: 3 }),
      ])),
      sample('list-check', '待辦清單', list('check', [
        listItem('完成規格', { checked: true }),
        listItem('撰寫測試', { checked: true }),
        listItem('上線', { checked: false }),
      ])),
      sample('list-nested', '巢狀清單', list('bullet', [
        listItem('第一層'),
        listItem('', { value: 2 }, [
          list('bullet', [
            listItem('第二層'),
            listItem('', { value: 2 }, [
              list('bullet', [
                listItem('第三層'),
              ]),
            ]),
          ]),
        ]),
        listItem('回到第一層', { value: 2 }),
      ])),
    ],
  },
  {
    type: 'table',
    label: '表格',
    description: '有標題列的表格；編輯時可以調整欄寬、增減列和欄。',
    samples: [
      sample('table', '表格', table([
        ['套件', '用途'],
        ['@hakulex/editor', '編輯器'],
        ['@hakulex/renderer', '唯讀呈現'],
      ])),
    ],
  },
  {
    type: 'horizontalrule',
    label: '分隔線',
    description: '段落之間的水平分隔線。',
    samples: [
      sample('horizontalrule', '分隔線', ...say('分隔線的上面'), { type: 'horizontalrule', version: 1 }, ...say('分隔線的下面')),
    ],
  },
  {
    type: 'code-block',
    label: '程式碼區塊',
    description: '有語法高亮的程式碼，可以選擇語言和複製。',
    samples: [
      sample('code-block', '程式碼區塊', {
        type: 'code-block',
        version: 1,
        language: 'typescript',
        code: 'function greet(name: string) {\n  return \'Hello, \' + name\n}\n\nconsole.log(greet(\'world\'))',
      }),
    ],
  },
  {
    type: 'code-snippet',
    label: '程式碼片段',
    description: '多個檔案的程式碼，以分頁切換。',
    samples: [
      sample('code-snippet', '程式碼片段', {
        type: 'code-snippet',
        version: 1,
        files: [
          {
            filename: 'main.ts',
            code: 'import { greet } from \'./greet\'\n\nconsole.log(greet(\'world\'))',
            highlightLines: [3],
          },
          { filename: 'greet.ts', code: 'export function greet(name: string) {\n  return \'Hello, \' + name\n}' },
          { filename: 'style.css', code: '.greeting {\n  color: tomato;\n}' },
        ],
      }),
    ],
  },
  {
    type: 'mermaid',
    label: 'Mermaid 圖',
    description: '用 Mermaid 語法畫的流程圖、循序圖、圓餅圖和類別圖。',
    samples: [
      sample('mermaid-flow', '流程圖', { type: 'mermaid', version: 1, diagram: 'graph TD\n  A[開始] --> B{通過？}\n  B -->|是| C[上線]\n  B -->|否| D[修正]\n  D --> B' }),
      sample('mermaid-sequence', '循序圖', { type: 'mermaid', version: 1, diagram: 'sequenceDiagram\n  瀏覽器->>伺服器: 請求\n  伺服器-->>瀏覽器: 回應' }),
      sample('mermaid-pie', '圓餅圖', { type: 'mermaid', version: 1, diagram: 'pie title 流量來源\n  "搜尋" : 60\n  "社群" : 25\n  "直接" : 15' }),
      sample('mermaid-class', '類別圖', { type: 'mermaid', version: 1, diagram: 'classDiagram\n  class 節點 {\n    +exportJSON()\n  }\n  class 段落\n  節點 <|-- 段落' }),
    ],
  },
  {
    type: 'katex-block',
    label: '公式區塊',
    description: '獨立成段、由 KaTeX 排版的數學式。',
    samples: [
      sample('katex-block', '公式區塊', { type: 'katex-block', version: 1, equation: '\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}' }),
    ],
  },
  {
    type: 'image',
    label: '圖片',
    description: '可以點擊放大的圖片，有說明文字；載入失敗時顯示替代畫面。',
    samples: [
      sample('image', '圖片', {
        type: 'image',
        version: 1,
        src: '/samples/photo-1.jpg',
        altText: '藍綠色的漸層',
        width: 800,
        height: 600,
        caption: '圖片下方的說明文字',
      }),
      sample('image-error', '載入失敗', {
        type: 'image',
        version: 1,
        src: '/samples/missing.jpg',
        altText: '這張圖片不存在',
        width: 800,
        height: 600,
      }),
    ],
  },
  {
    type: 'video',
    label: '影片',
    description: '有播放控制項的影片。',
    samples: [
      sample('video', '影片', {
        type: 'video',
        version: 1,
        src: '/samples/clip.mp4',
        poster: '/samples/photo-1.jpg',
        width: 320,
        height: 180,
      }),
    ],
  },
  {
    type: 'file',
    label: '檔案',
    description: '可以下載的附件，顯示檔名和大小。',
    samples: [
      sample('file', '檔案', {
        type: 'file',
        version: 1,
        src: '/samples/photo-2.jpg',
        name: 'photo-2.jpg',
        size: 10120,
        mimeType: 'image/jpeg',
        ext: 'jpg',
      }),
    ],
  },
  {
    type: 'embed',
    label: '嵌入',
    description: '依網址嵌入 YouTube 等外部內容，需要連上該網站才看得到。',
    samples: [
      sample('embed', '嵌入', {
        type: 'embed',
        version: 1,
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        source: 'youtube',
      }),
      sample('embed-x-post', 'X 貼文', {
        type: 'embed',
        version: 1,
        url: 'https://x.com/jack/status/20',
        source: 'tweet',
      }),
    ],
  },
  {
    type: 'link-card',
    label: '連結卡片',
    description: '把連結顯示成有標題、說明和圖片的卡片。',
    samples: [
      sample('link-card', '連結卡片', {
        type: 'link-card',
        version: 1,
        url: 'https://lexical.dev',
        title: 'Lexical',
        description: 'An extensible JavaScript web text-editor framework by Meta.',
        image: '/samples/photo-3.jpg',
      }),
    ],
  },
  {
    type: 'chart',
    label: '圖表',
    description: '由 JSON 規格畫出的圖表，呈現時是 SVG。',
    samples: [
      sample('chart', '長條圖', {
        type: 'chart',
        version: 1,
        spec: JSON.stringify({
          version: 1,
          type: 'bar',
          title: '每月造訪人數',
          x: 'month',
          series: [
            { key: 'visits', label: '造訪' },
          ],
          data: months.map((month, index) => ({ month, visits: visits[index] })),
        }, null, 2),
      }),
    ],
  },
  {
    type: 'poll',
    label: '投票',
    description: '單選或複選的投票。票數由網站提供的後端處理，這裡存在記憶體，重新整理就回到初始值。',
    samples: [
      sample('poll-single', '單選', poll('p_demo_lunch', '午餐吃什麼？', [
        ['o_noodle', '麵'],
        ['o_rice', '飯'],
        ['o_salad', '沙拉'],
      ])),
      sample('poll-multiple', '複選', poll('p_demo_pets', '養過哪些動物？', [
        ['o_cat', '貓'],
        ['o_dog', '狗'],
        ['o_fish', '魚'],
        ['o_none', '都沒有'],
      ], { mode: 'multiple', showResults: 'after-vote' })),
    ],
  },
  {
    type: 'chat',
    label: '對話',
    description: '對話紀錄，訊息內容支援 Markdown。有使用者與助理、使用者之間兩種樣式。',
    samples: [
      sample('chat-user-agent', '使用者與助理', {
        type: 'chat',
        version: 1,
        variant: 'user-agent',
        participants: [
          { id: 'u', kind: 'user', name: '小明' },
          { id: 'a', kind: 'agent', name: '助理' },
        ],
        messages: [
          { id: '1', participantId: 'u', content: '怎麼讓文字變粗？' },
          { id: '2', participantId: 'a', content: '用兩個星號：`**粗體**` 會變成 **粗體**。' },
        ],
      }),
      sample('chat-user-user', '使用者之間', {
        type: 'chat',
        version: 1,
        variant: 'user-user',
        participants: [
          { id: 'u', kind: 'user', name: '小明' },
          { id: 'o', kind: 'user', name: '小華' },
        ],
        messages: [
          { id: '1', participantId: 'u', content: '午餐吃什麼？' },
          { id: '2', participantId: 'o', content: '都可以' },
        ],
      }),
    ],
  },
  {
    type: 'dynamic',
    label: '動態元件',
    description: '從網址載入的 JavaScript 元件，這裡是 demo 自己的計數器。',
    samples: [
      sample('dynamic', '動態元件', {
        type: 'dynamic',
        version: 1,
        url: '/dynamic/counter.js',
        props: { start: 3, label: '範例計數器' },
        initialHeight: 160,
      }),
    ],
  },
])
