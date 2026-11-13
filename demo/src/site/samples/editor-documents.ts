import type { SerializedEditorState } from 'lexical'

/*
 * Documents for E2E tests and for trying odd cases on the editor page, which lists them only
 * in development: what each test needs, older stored formats, unknown content, fetching and
 * dynamic blocks. Tests load them by their button names. Visitors get the 範例文件 instead.
 */

// A document from a newer or fuller editor: these types aren't registered here.
function text(value: string) {
  return {
    type: 'text',
    version: 1,
    text: value,
    format: 0,
    style: '',
    mode: 'normal',
    detail: 0,
  }
}
function paragraph(...children: unknown[]) {
  return {
    type: 'paragraph',
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    textFormat: 0,
    textStyle: '',
    children,
  }
}
function link(url: string, value: string) {
  return {
    type: 'link',
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    url,
    rel: null,
    target: null,
    title: null,
    children: [
      text(value),
    ],
  }
}
function blocksSample(): SerializedEditorState {
  const root = (...children: unknown[]) => ({
    type: 'root',
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    children,
  })
  // Placeholder pictures, one colour each, with their number on them.
  const colours: Record<number, string> = {
    10: '4a6b8a',
    20: 'a0785a',
    30: '3f7f6f',
    40: '2f5f8f',
    50: '7a5c8f',
  }
  const photos = [10, 20, 30, 40, 50].map(id => ({
    src: `https://dummyimage.com/800x600/${colours[id]}/fff.png?text=Photo+${id}`,
    alt: `照片 ${id}`,
    width: 800,
    height: 600,
  }))
  return {
    root: root(
      paragraph(text('程式碼片段')),
      {
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
      },
      paragraph(text('格狀圖庫')),
      {
        type: 'gallery',
        version: 1,
        images: photos.slice(0, 3),
        layout: 'grid',
        aspect: '4:3',
        fit: 'cover',
      },
      paragraph(text('瀑布流圖庫')),
      {
        type: 'gallery',
        version: 1,
        images: photos,
        layout: 'masonry',
        maxItemHeight: 320,
      },
      paragraph(text('輪播圖庫')),
      {
        type: 'gallery',
        version: 1,
        images: photos,
        layout: 'carousel',
        aspect: '16:9',
      },
      paragraph(text('使用者與助理')),
      {
        type: 'chat',
        version: 1,
        variant: 'user-agent',
        participants: [
          { id: 'u', kind: 'user', name: '小明' },
          { id: 'a', kind: 'agent', name: 'Claude' },
        ],
        messages: [
          { id: '1', participantId: 'u', content: '怎麼讓文字變粗？' },
          { id: '2', participantId: 'a', content: '用兩個星號：\n\n- `**粗體**` 會變成 **粗體**\n- 也可以參考 [說明](https://example.com)\n\n```ts\nconst a = 1\n```' },
          { id: '3', participantId: 'u', content: '<img src=x onerror="alert(1)"><script>alert(1)<\/script> [x](javascript:alert(1))' },
        ],
      },
      paragraph(text('使用者之間')),
      {
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
      },
      paragraph(text('結尾')),
    ),
  } as unknown as SerializedEditorState
}

function containersSample(): SerializedEditorState {
  const root = (...children: unknown[]) => ({
    type: 'root',
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    children,
  })
  const cell = (...lines: string[]) => ({
    root: root(...lines.map(line => paragraph(text(line)))),
  })
  return {
    root: root(
      paragraph(text('容器之前')),
      {
        type: 'nested-doc',
        version: 1,
        content: cell('巢狀文件的第一段。'),
      },
      paragraph(text('長文件之前')),
      {
        type: 'nested-doc',
        version: 1,
        content: cell(...Array.from({ length: 8 }, (_, i) => `長文件的第 ${i + 1} 段。`)),
      },
      paragraph(text('格狀版面之前')),
      {
        type: 'grid-container',
        version: 1,
        cols: 2,
        gap: '16px',
        cells: [
          cell('第一格'),
          cell('第二格'),
          cell('第三格'),
          cell('第四格'),
        ],
      },
      paragraph(text('舊形式之前')),
      {
        type: 'grid-container',
        version: 1,
        cols: 3,
        gap: 8,
        children: [
          paragraph(text('舊格一')),
          paragraph(text('舊格二')),
          paragraph(text('舊格三')),
        ],
      },
      paragraph(text('容器之後')),
    ),
  } as unknown as SerializedEditorState
}

function stepsSample(): SerializedEditorState {
  const root = (...children: unknown[]) => ({
    type: 'root',
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    children,
  })
  const embed = (url: string, source: string | null) => ({
    type: 'embed',
    version: 1,
    url,
    source,
  })
  return {
    root: root(
      paragraph(
        text('感謝 '),
        {
          type: 'mention',
          version: 1,
          platform: 'GH',
          handle: 'KennKyou',
          displayName: 'Ken',
        },
        text('。'),
      ),
      {
        type: 'steps',
        version: 1,
        steps: [
          {
            id: 'a',
            title: '安裝',
            content: {
              root: root(paragraph(text('先裝好相依套件。'))),
            },
          },
          {
            id: 'b',
            title: '設定',
            content: {
              root: root(paragraph(text('再寫設定檔。'))),
            },
          },
          {
            id: 'c',
            title: '啟動',
            content: {
              root: root(paragraph(text('最後啟動。'))),
            },
          },
        ],
      },
      paragraph(text('步驟之後的段落')),
      embed('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'),
      embed('https://www.bilibili.com/video/BV1xx411c7mD', 'bilibili'),
      embed('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', 'spotify'),
      embed('https://music.apple.com/us/album/1989-taylors-version/1708308989', 'apple-music'),
      embed('https://codesandbox.io/s/new', 'codesandbox'),
      embed('https://gist.github.com/mbostock/4063269', 'github-gist'),
      embed('https://x.com/jack/status/20', 'tweet'),
      embed('https://example.com/', null),
      paragraph(text('結尾')),
    ),
  } as unknown as SerializedEditorState
}

function chartSample(): SerializedEditorState {
  const chart = (spec: Record<string, unknown>) => ({
    type: 'chart',
    version: 1,
    spec: JSON.stringify({ version: 1, ...spec }, null, 2),
  })
  const months = ['一月', '二月', '三月', '四月', '五月', '六月']
  return {
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children: [
        chart({
          type: 'bar',
          title: '首次繪製的提交次數',
          subtitle: '載入 3,200 字文章時',
          x: 'part',
          series: [
            { key: 'before', label: '之前' },
            { key: 'after', label: '之後' },
          ],
          highlight: 'after',
          refs: [
            { y: 1500, label: '預算' },
          ],
          data: [
            { part: '編輯器', before: 2400, after: 1200 },
            { part: '工具列', before: 1800, after: 900 },
            { part: '區塊把手', before: 3200, after: 1400 },
            { part: '斜線選單', before: 1100, after: 800 },
          ],
          source: 'demo 範例資料',
        }),
        chart({
          type: 'line',
          title: '每月讀者',
          x: 'month',
          format: { compact: true },
          series: [
            { key: 'web', label: '網頁' },
            { key: 'rss', label: 'RSS' },
          ],
          data: months.map((month, index) => ({
            month,
            web: 1200 + index * 340,
            rss: index === 2
              ? null
              : 400 + index * 60,
          })),
          note: '三月的 RSS 資料遺失',
        }),
        chart({
          type: 'area',
          stacked: true,
          title: '流量來源',
          x: 'month',
          series: [
            { key: 'search', label: '搜尋' },
            { key: 'social', label: '社群' },
            { key: 'direct', label: '直接' },
          ],
          data: months.map((month, index) => ({
            month,
            search: 30 + index * 5,
            social: 20 + (index % 3) * 6,
            direct: 15 + index * 2,
          })),
          format: { unit: '%' },
        }),
        chart({
          type: 'pie',
          donut: true,
          title: '使用的瀏覽器',
          x: 'browser',
          series: [
            { key: 'share' },
          ],
          data: [
            { browser: 'Chrome', share: 62 },
            { browser: 'Safari', share: 21 },
            { browser: 'Firefox', share: 9 },
            { browser: '其他', share: 8 },
          ],
        }),
        chart({
          type: 'pie',
          title: '最常寫的主題',
          subtitle: '超過 6 項時，較小的幾項合併成「其他」',
          x: 'topic',
          series: [
            { key: 'posts', label: '篇數' },
          ],
          data: [
            { topic: '前端', posts: 40 },
            { topic: '旅行', posts: 5 },
            { topic: '讀書', posts: 30 },
            { topic: '攝影', posts: 1 },
            { topic: '音樂', posts: 20 },
            { topic: '料理', posts: 2 },
            { topic: '工具', posts: 10 },
            { topic: '生活', posts: 3 },
          ],
        }),
        chart({
          type: 'bar',
          title: 'API 回應時間',
          x: 'endpoint',
          format: { unit: 'ms', decimals: 1 },
          series: [
            { key: 'p50', label: '中位數' },
            { key: 'p95', label: '第 95 百分位' },
          ],
          data: [
            { endpoint: '/posts', p50: 82.4, p95: 1240.5 },
            { endpoint: '/search', p50: 310.2, p95: 2380 },
            { endpoint: '/comments', p50: 45.9, p95: 610.3 },
          ],
        }),
        chart({
          type: 'bar',
          title: '下個月的投票數',
          subtitle: '還沒開始，資料是空的',
          x: 'day',
          series: [
            { key: 'votes', label: '票數' },
          ],
          data: [],
        }),
      ],
    },
  } as unknown as SerializedEditorState
}

function pollSample(): SerializedEditorState {
  const poll = (pollId: string, question: string, options: [string, string][], extra: Record<string, unknown> = {}) => ({
    type: 'poll',
    version: 1,
    pollId,
    question,
    options: options.map(([id, label]) => ({ id, label })),
    mode: 'single',
    ...extra,
  })
  return {
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children: [
        poll('p_demo_lunch', '午餐吃什麼？', [
          ['o_noodle', '麵'],
          ['o_rice', '飯'],
          ['o_salad', '沙拉'],
        ]),
        poll('p_demo_pets', '養過哪些動物？', [
          ['o_cat', '貓'],
          ['o_dog', '狗'],
          ['o_fish', '魚'],
          ['o_none', '都沒有'],
        ], { mode: 'multiple', showResults: 'after-vote' }),
        poll('p_demo_closed', '要不要辦聚會？', [
          ['o_yes', '要'],
          ['o_no', '不要'],
        ], { closeAt: '2026-01-01T00:00:00.000Z', showResults: 'after-close' }),
        paragraph(text('在預覽分頁投票；票數存在記憶體裡，重新整理後就會清空。')),
      ],
    },
  } as unknown as SerializedEditorState
}

// No network: the picture is one pixel, and its stored size sets the shape.
function cardAndFloatSample(): SerializedEditorState {
  const picture = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  const image = (extra: Record<string, unknown>) => ({
    type: 'image',
    version: 1,
    src: picture,
    altText: '繞排的圖片',
    width: 900,
    height: 620,
    ...extra,
  })
  const prose = '這段文字在圖片旁邊繞排，到了圖片下方才回到整行的寬度。'.repeat(14)
  return {
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children: [
        {
          type: 'link-card',
          version: 1,
          url: 'https://lexical.dev',
          title: 'Lexical - Extensible Text Editor Framework',
          description: 'An extensible JavaScript web text-editor framework by Meta.',
          image: picture,
        },
        image({ layout: 'float-left' }),
        paragraph(text(prose)),
        image({ layout: 'float-right', displayWidth: 30, caption: '靠右，寬度 30%' }),
        paragraph(text(prose)),
        image({ layout: 'float-right', displayWidth: 20 }),
      ],
    },
  } as unknown as SerializedEditorState
}

// Cards that store only their address: what they show is fetched from
// GitHub and arXiv once they come near the screen. The last one no source knows.
function fetchedCardsSample(): SerializedEditorState {
  const card = (url: string) => ({ type: 'link-card', version: 1, url })
  return {
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children: [
        card('https://github.com/facebook/lexical'),
        card('https://github.com/facebook/lexical/pull/7000'),
        card('https://github.com/facebook/lexical/issues/1000'),
        card('https://arxiv.org/abs/1706.03762'),
        card('https://example.com/no-source'),
        paragraph(link('https://github.com/KennKyou/hakulex', 'hakulex')),
        paragraph(text('貼上 GitHub 或 arXiv 的網址到空白行，會變成卡片。')),
      ],
    },
  } as unknown as SerializedEditorState
}

// Older stored shapes: alerts and banners hold a whole document in `content`, the
// footnote section needn't be last, and an image can sit in a table cell's paragraph.
function storedFormatsSample(): SerializedEditorState {
  const content = (...children: unknown[]) => ({
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children,
    },
  })
  const image = {
    type: 'image',
    version: 1,
    src: 'https://dummyimage.com/120x80/336699/fff.png',
    altText: '表格裡的圖片',
    thumbhash: 'abc=',
    accent: '#336699',
  }
  const shape = {
    version: 1,
    format: '',
    indent: 0,
    direction: null,
  }
  return {
    ...content(
      {
        type: 'alert-quote',
        version: 1,
        alertType: 'tip',
        content: content(paragraph(text('存在 content 裡的提示'))),
      },
      {
        type: 'banner',
        version: 1,
        bannerType: 'warning',
        content: content(paragraph(text('存在 content 裡的橫幅'))),
      },
      {
        type: 'footnote-section',
        version: 1,
        definitions: { 1: '文件中間的註腳區' },
      },
      {
        ...shape,
        type: 'table',
        children: [
          {
            ...shape,
            type: 'tablerow',
            children: [
              {
                ...shape,
                type: 'tablecell',
                backgroundColor: null,
                colSpan: 1,
                headerState: 0,
                rowSpan: 1,
                children: [
                  paragraph(image),
                ],
              },
            ],
          },
        ],
      },
      paragraph(text('最後一段'), { type: 'footnote', version: 1, identifier: '1' }),
    ),
  } as unknown as SerializedEditorState
}

/** A dynamic block: the demo's own sample component, served from `public/dynamic`. */
function dynamicSample(): SerializedEditorState {
  return {
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children: [
        paragraph(text('前')),
        {
          type: 'dynamic',
          version: 1,
          url: '/dynamic/counter.js',
          props: { start: 3, label: '範例計數器' },
          initialHeight: 160,
        },
        paragraph(text('後')),
      ],
    },
  } as unknown as SerializedEditorState
}

function unknownSample(): SerializedEditorState {
  return {
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children: [
        {
          type: 'excalidraw',
          version: 1,
          question: '午餐吃什麼？',
          options: [
            { id: 'a', label: '麵' },
          ],
        },
        paragraph(
          text('前'),
          {
            ...text('徽章'),
            type: 'badge',
          },
          text('中'),
          {
            type: 'chip',
            version: 1,
            label: 'Ken',
          },
          text('後'),
        ),
        paragraph(text('一段可以編輯的文字')),
        { type: `a-very-long-type-name-${'x'.repeat(200)}`, version: 1 },
        {
          type: 'container-x',
          version: 1,
          cols: 2,
          gap: 8,
          cells: [],
        },
      ],
    },
  } as unknown as SerializedEditorState
}

function annotationSample(): SerializedEditorState {
  const quote = {
    type: 'quote',
    version: 1,
    format: '',
    indent: 0,
    direction: null,
  }
  return {
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children: [
        paragraph(text('前'), {
          ...text('標籤'),
          type: 'tag',
        }, text('中'), {
          ...text('筆記'),
          type: 'comment',
        }, text('後')),
        {
          ...quote,
          type: 'rich-quote',
          attribution: '魯迅',
          children: [
            text('有出處的引用'),
          ],
        },
        {
          ...quote,
          children: [
            text('一般的引用'),
          ],
        },
        {
          ...quote,
          type: 'alert-quote',
          alertType: 'note',
          children: [
            {
              ...quote,
              children: [
                text('提示裡的引用'),
              ],
            },
          ],
        },
        paragraph(text('最後一段')),
      ],
    },
  } as unknown as SerializedEditorState
}

export interface EditorDocument {
  /** The button's name, which E2E tests click. */
  label: string
  build: () => SerializedEditorState
}

export const SAMPLE_DOCUMENTS: EditorDocument[] = [
  { label: '載入圖表', build: chartSample },
  { label: '載入投票', build: pollSample },
  { label: '載入連結卡片和繞排圖片', build: cardAndFloatSample },
  { label: '載入程式碼片段、圖庫和對話', build: blocksSample },
  { label: '載入巢狀文件和格狀版面', build: containersSample },
  { label: '載入提及、嵌入和步驟', build: stepsSample },
  { label: '載入標籤和引用', build: annotationSample },
]

/** Cases visitors rarely meet. */
export const DEVELOPMENT_DOCUMENTS: EditorDocument[] = [
  { label: '載入自動抓資料的卡片', build: fetchedCardsSample },
  { label: '載入舊格式文件', build: storedFormatsSample },
  { label: '載入動態元件', build: dynamicSample },
  { label: '載入含未支援內容的文件', build: unknownSample },
]
