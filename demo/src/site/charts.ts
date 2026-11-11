/* The chart samples of /charts. Plain data, so that E2E can import the list. */

export type ChartKind = 'bar' | 'line' | 'area' | 'pie' | 'state'

export interface ChartSample {
  key: string
  kind: ChartKind
  label: string
  description: string
  /** A chart's spec, or a string for what can't be parsed. */
  spec: unknown
  frame?: 'narrow' | 'dark'
}

export const chartKinds: { key: ChartKind, label: string }[] = [
  { key: 'bar', label: '長條圖' },
  { key: 'line', label: '折線圖' },
  { key: 'area', label: '面積圖' },
  { key: 'pie', label: '圓餅圖' },
  { key: 'state', label: '狀態' },
]

const quarters = ['第一季', '第二季', '第三季', '第四季']
const months = ['一月', '二月', '三月', '四月', '五月', '六月']

function rows(x: string, labels: string[], series: Record<string, number[]>) {
  return labels.map((label, index) => ({
    [x]: label,
    ...Object.fromEntries(Object.entries(series).map(([key, values]) => [key, values[index]])),
  }))
}

const beforeAfter = {
  version: 1,
  type: 'bar',
  title: '首次繪製的時間',
  subtitle: '載入一篇 3,200 字文章時',
  x: 'part',
  series: [
    { key: 'before', label: '之前' },
    { key: 'after', label: '之後' },
  ],
  format: { unit: ' ms' },
  data: rows('part', ['編輯器', '工具列', '區塊把手', '斜線選單'], {
    before: [84, 46, 31, 22],
    after: [36, 18, 12, 8],
  }),
}

const revenue = {
  version: 1,
  type: 'bar',
  title: '各季營收',
  x: 'quarter',
  series: [
    { key: 'north', label: '北區' },
    { key: 'central', label: '中區' },
    { key: 'south', label: '南區' },
  ],
  format: { unit: ' 萬' },
  data: rows('quarter', quarters, {
    north: [320, 410, 380, 520],
    central: [210, 260, 300, 340],
    south: [150, 190, 240, 280],
  }),
}

const traffic = {
  version: 1,
  type: 'line',
  title: '每月造訪',
  x: 'month',
  series: [
    { key: 'web', label: '網站' },
    { key: 'app', label: 'App' },
  ],
  data: rows('month', months, {
    web: [
      12000,
      15000,
      14200,
      18800,
      21000,
      24500,
    ],
    app: [8000, 9200, 11800, 13000, 16500, 19800],
  }),
}

const latency = {
  version: 1,
  type: 'line',
  title: '回應時間',
  x: 'month',
  series: [
    { key: 'p50', label: 'p50' },
    { key: 'p95', label: 'p95' },
  ],
  format: { unit: ' ms' },
  data: rows('month', months, {
    p50: [120, 118, 110, 105, 98, 96],
    p95: [480, 450, 430, 390, 360, 340],
  }),
}

const usage = {
  version: 1,
  type: 'area',
  title: '儲存空間',
  x: 'month',
  series: [
    { key: 'images', label: '圖片' },
    { key: 'video', label: '影片' },
    { key: 'files', label: '檔案' },
  ],
  stacked: true,
  format: { unit: ' GB' },
  data: rows('month', months, {
    images: [20, 26, 30, 38, 44, 52],
    video: [40, 48, 62, 70, 86, 94],
    files: [10, 12, 13, 15, 16, 20],
  }),
}

const share = {
  version: 1,
  type: 'pie',
  title: '流量來源',
  x: 'source',
  series: [
    { key: 'visits', label: '造訪' },
  ],
  data: [
    { source: '搜尋', visits: 58 },
    { source: '社群', visits: 24 },
    { source: '直接', visits: 12 },
    { source: '其他', visits: 6 },
  ],
}

function sample(kind: ChartKind, key: string, label: string, description: string, spec: unknown, frame?: ChartSample['frame']): ChartSample {
  return {
    key,
    kind,
    label,
    description,
    spec,
    ...(frame
      ? { frame }
      : {}),
  }
}

export const chartSamples: ChartSample[] = [
  sample('bar', 'bar-grouped', '分組', '兩組資料並排比較。', beforeAfter),
  sample('bar', 'bar-highlight', '強調', 'highlight 指定一組資料，其他變成灰色。', { ...beforeAfter, highlight: 'after' }),
  sample('bar', 'bar-negative', '負值', '只有一組資料，有正有負。', {
    version: 1,
    type: 'bar',
    title: '每月淨增加',
    x: 'month',
    series: [
      { key: 'delta', label: '增減' },
    ],
    format: { signed: true },
    data: rows('month', months, {
      delta: [120, -40, 80, -110, 60, 150],
    }),
  }),
  sample('bar', 'bar-three', '三組', '三組資料並排，加上單位。', revenue),
  sample('bar', 'bar-stacked', '堆疊', 'stacked 把各組資料疊起來。', { ...revenue, stacked: true }),

  sample('line', 'line-multi', '多條線', '兩組資料的趨勢。', traffic),
  sample('line', 'line-ref', '參考線', 'refs 畫出水平的參考線。', {
    ...latency,
    refs: [
      { y: 400, label: '目標' },
    ],
  }),
  sample('line', 'line-highlight', '強調', 'highlight 指定一條線，其他變成灰色。', { ...latency, highlight: 'p95' }),

  sample('area', 'area-stacked', '堆疊', '各組資料疊成總量。', usage),
  sample('area', 'area-single', '單組', '只有一組資料的面積圖。', {
    ...usage,
    title: '圖片用量',
    stacked: false,
    series: [
      { key: 'images', label: '圖片' },
    ],
  }),

  sample('pie', 'pie', '圓餅', '各部分佔整體的比例。', share),
  sample('pie', 'donut', '環圈', 'donut 中間留空。', { ...share, donut: true }),

  sample('state', 'state-empty', '空資料', '沒有資料時顯示說明。', { ...traffic, data: [] }),
  sample('state', 'state-error', '資料錯誤', '資料不符合規格時，列出哪裡有問題。', {
    ...traffic,
    data: [
      { month: '一月', web: '很多', app: 8000 },
    ],
  }),
  sample('state', 'state-json-error', 'JSON 錯誤', '內容不是合法的 JSON。', '{ "version": 1, "type": '),
  sample('state', 'state-table', '資料表檢視', '按「檢視資料」看表格，鍵盤和螢幕閱讀器也能用。', revenue),
  sample('state', 'state-narrow', '窄版長條', '容器只有 360px 寬。', revenue, 'narrow'),
  sample('state', 'state-narrow-line', '窄版折線', '容器只有 360px 寬。', traffic, 'narrow'),
  sample('state', 'state-dark', '深色', '在深色主題下呈現。', beforeAfter, 'dark'),
]

export const chartSamplesOf = (kind: ChartKind) => chartSamples.filter(item => item.kind === kind)

export const findChartKind = (kind: unknown) => chartKinds.find(item => item.key === kind)

/** A sample as a `chart` node stores it. */
export function chartSource(spec: unknown) {
  return typeof spec === 'string'
    ? spec
    : JSON.stringify(spec, null, 2)
}
