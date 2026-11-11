import { defineNodes, doc, element, paragraph, sample, say, text } from './helpers'

const CALLOUTS = [
  ['note', '備註'],
  ['tip', '提示'],
  ['important', '重要'],
  ['warning', '警告'],
  ['caution', '小心'],
] as const

const photos = ['/samples/photo-1.jpg', '/samples/photo-2.jpg', '/samples/photo-3.jpg'].map((src, index) => ({
  src,
  alt: `漸層 ${index + 1}`,
  width: 800,
  height: 600,
}))

export const containerNodes = defineNodes('container', [
  {
    type: 'alert-quote',
    label: '提示',
    description: '有圖示的提示區塊，共五種類型，Markdown 寫成 > [!NOTE]。',
    samples: CALLOUTS.map(([alertType, label]) => sample(
      `alert-${alertType}`,
      label,
      element('alert-quote', say(`這是一則「${label}」。`), { alertType }),
    )),
  },
  {
    type: 'banner',
    label: '橫幅',
    description: '比提示更醒目的整塊橫幅，類型和提示相同。',
    samples: CALLOUTS.map(([bannerType, label]) => sample(
      `banner-${bannerType}`,
      label,
      element('banner', say(`這是一則「${label}」橫幅。`), { bannerType }),
    )),
  },
  {
    type: 'details',
    label: '摺疊',
    description: '點標題才展開內容的區塊。',
    samples: [
      sample('details', '摺疊', element('details', say('展開之後才看得到的內容。', '裡面可以有多個段落。'), {
        summary: '點這裡展開',
        open: false,
      })),
    ],
  },
  {
    type: 'gallery',
    label: '圖庫',
    description: '一組圖片，可以排成格狀或輪播。',
    samples: [
      sample('gallery-grid', '格狀', {
        type: 'gallery',
        version: 1,
        images: photos,
        layout: 'grid',
        aspect: '4:3',
      }),
      sample('gallery-carousel', '輪播', {
        type: 'gallery',
        version: 1,
        images: photos,
        layout: 'carousel',
        aspect: '16:9',
        // A part of the next photo shows, so it's clear there is more to scroll to.
        perView: 1.2,
      }),
    ],
  },
  {
    type: 'grid-container',
    label: '格狀版面',
    description: '把內容排成多欄，每一格都是獨立的文件。',
    samples: [
      sample('grid-container', '格狀版面', {
        type: 'grid-container',
        version: 1,
        cols: 2,
        gap: '16px',
        cells: ['第一格', '第二格', '第三格', '第四格'].map(label => doc(...say(label))),
      }),
    ],
  },
  {
    type: 'steps',
    label: '步驟',
    description: '有編號的操作步驟，每一步都有標題和自己的內容。',
    samples: [
      sample('steps', '步驟', {
        type: 'steps',
        version: 1,
        steps: [
          {
            id: 'install',
            title: '安裝',
            content: doc(...say('先裝好相依套件。')),
          },
          {
            id: 'config',
            title: '設定',
            content: doc(...say('再寫設定檔。')),
          },
          {
            id: 'run',
            title: '啟動',
            content: doc(...say('最後啟動。')),
          },
        ],
      }),
    ],
  },
  {
    type: 'nested-doc',
    label: '巢狀文件',
    description: '文件裡的另一份文件，太長時會收合；編輯時在對話框裡修改。',
    samples: [
      sample('nested-doc', '巢狀文件', {
        type: 'nested-doc',
        version: 1,
        content: doc(
          paragraph(text('這是巢狀文件的第一段。')),
          ...say('裡面可以放任何節點。'),
        ),
      }),
    ],
  },
])
