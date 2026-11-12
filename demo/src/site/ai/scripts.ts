import type { Model, ModelRequest, ScriptStep } from '@hakulex/agent-core'
import { scriptedModel } from '@hakulex/agent-core'
import { AGENDA, AGENDA_HEADING, INTRO, QUOTE, SIGNUP, SIGNUP_HEADING, TITLE, TOPIC } from './document'

/*
 * What the AI on the demo page says and does. Nothing here asks a service: each request is
 * matched to a script by its words. A real model reads the block ids out of the document it is
 * sent; a script cannot, so these find the blocks by what they say, and leave out any step
 * whose block is no longer there. A document the reader has changed gets less done, not an error.
 */

export const SHORTER = '把開頭改得精簡一點'
export const TABLE = '把議程整理成表格'
export const FAQ = '在結尾加上常見問題'
export const SUMMARY = '這篇的重點是什麼？'
export const ENGLISH = '翻成英文'
export const suggestions = [SHORTER, TABLE, FAQ, SUMMARY]

// Each is the original with words taken out and none moved, so the revision reads as plain strike-throughs.
const INTRO_SHORT = '大家好，我們預計在十二月舉辦今年最後一場讀書會。'
const TOPIC_SHORT = '這一次的主題是「把文件寫清楚」，希望大家一起聊聊寫文件時遇到的問題。'

/** The English for each block as it was written, and for the shorter openings. */
const english: [words: string, xml: string][] = [
  [TITLE, '<h1>December Reading Group: Writing Clear Documents</h1>'],
  [INTRO, '<p>Hello everyone. First of all, thank you for supporting and joining the reading group all this time. We have some news: we plan to hold the last session of the year in December.</p>'],
  [TOPIC, '<p>After several rounds of discussion we settled on the topic "Writing Clear Documents". We hope to talk through the many problems everyone runs into when writing documents.</p>'],
  [INTRO_SHORT, '<p>Hello everyone. We plan to hold the last reading group of the year in December.</p>'],
  [TOPIC_SHORT, '<p>This time the topic is "Writing Clear Documents". We hope to talk through the problems we meet when writing them.</p>'],
  [AGENDA_HEADING, '<h2>Agenda</h2>'],
  [
    AGENDA.map(row => row.join(' ')).join(''),
    '<ul><li><p>19:00 Check-in and introductions</p></li><li><p>19:20 Opening talk: why nobody reads the docs</p></li><li><p>20:00 Group discussion</p></li><li><p>20:40 Sharing and wrap-up</p></li></ul>',
  ],
  [QUOTE, '<blockquote>Writing clearly is a kindness to the reader.</blockquote>'],
  [SIGNUP_HEADING, '<h2>How to sign up</h2>'],
  [SIGNUP, '<p>The event is free and limited to twenty people. Please reply to this email by December 5 to sign up, and tell us the one question you most want to talk about.</p>'],
]

interface Block {
  id: string
  tag: string
  /** Its words with the markup and all spacing taken out, to compare with. */
  words: string
  selected: boolean
}

const squeeze = (value: string) => value.replace(/\s+/g, '')
function plain(xml: string) {
  return squeeze(xml.replace(/<[^>]*>/g, '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&'))
}

/** The newest message: the document's blocks, and what the author asked. */
function read(request: ModelRequest) {
  const last = request.messages.at(-1)
  const message = last?.role === 'user'
    ? last.text
    : ''
  const marker = 'The author\'s request:\n'
  const at = message.lastIndexOf(marker)
  const asked = at < 0
    ? message
    : message.slice(at + marker.length)
  const before = at < 0
    ? ''
    : message.slice(0, at)
  const quoted = /<selection block="([^"]+)"/.exec(before)?.[1]
  const body = before.split('<selection')[0]

  const blocks: Block[] = []
  const opening = /<([\w-]+)((?:\s+[\w:-]+="[^"]*")*)\s*\/?>/g
  const starts = [
    ...body.matchAll(opening),
  ].filter(match => /\sid="/.test(match[2]))
  starts.forEach((match, index) => {
    const id = /\sid="([^"]+)"/.exec(match[2])![1]
    const end = starts[index + 1]?.index ?? body.length
    blocks.push({
      id,
      tag: match[1],
      words: plain(body.slice(match.index, end)),
      selected: /\sselected="true"/.test(match[2]) || id === quoted,
    })
  })
  return { asked, blocks }
}

function scriptFor(request: ModelRequest): ScriptStep[][] {
  const { asked, blocks } = read(request)
  const find = (words: string) => blocks.find(block => block.words === squeeze(words))
  const only = (text: string): ScriptStep[][] => [
    [
      { text },
    ],
  ]

  if (asked.includes('精簡')) {
    const edits: ScriptStep[] = []
    const intro = find(INTRO)
    const topic = find(TOPIC)
    if (intro) {
      edits.push({
        tool: 'replace_block',
        input: { blockId: intro.id, xml: `<p>${INTRO_SHORT}</p>` },
      })
    }
    if (topic) {
      edits.push({
        tool: 'replace_block',
        input: { blockId: topic.id, xml: `<p>${TOPIC_SHORT}</p>` },
      })
    }
    if (edits.length === 0)
      return only('開頭的兩段已經不是原本的內容了，我沒有準備別的改法，所以這次沒有提出修改。')
    return [
      [
        { thinking: '開頭兩段都在鋪陳：感謝、預告、討論的過程。讀者要知道的只有兩件事：十二月有一場讀書會，主題是把文件寫清楚。' },
        { text: '開頭的兩段客套話比較多，重點要讀到後面才出現。我把鋪陳的字拿掉，各留一句。' },
        ...edits,
      ],
      [
        { text: `我提了 ${edits.length} 項修改，都在開頭。劃掉的是我建議拿掉的字，請在編輯器裡逐項接受或拒絕。` },
      ],
    ]
  }

  if (asked.includes('表格')) {
    const list = find(AGENDA.map(row => row.join(' ')).join(''))
    if (!list)
      return only('我找不到原本的議程清單，可能已經改過或換成表格了，所以這次沒有提出修改。')
    const rows = AGENDA.map(([time, what]) => `<tr><td>${time}</td><td>${what}</td></tr>`).join('')
    return [
      [
        { text: '議程每一項都是「時間加內容」，很適合用表格。' },
        {
          tool: 'replace_block',
          input: { blockId: list.id, xml: `<table><tr><th>時間</th><th>內容</th></tr>${rows}</table>` },
        },
      ],
      [
        { text: '我提議把議程的清單換成兩欄的表格：**時間**和**內容**。原本的清單在上，新的表格在下，接受之後表格可以照常編輯。' },
      ],
    ]
  }

  if (asked.includes('常見問題')) {
    return [
      [
        { text: '好，我在結尾加一段常見問題。' },
        {
          tool: 'insert_blocks',
          input: {
            position: 'end',
            xml: '<h2>常見問題</h2><p><b>需要先讀什麼嗎？</b>不用，帶著你遇到的問題來就可以。</p><p><b>可以線上參加嗎？</b>這一場只有實體，會後我們會整理重點分享給大家。</p>',
          },
        },
      ],
      [
        { text: '我在結尾加了一個小標題和兩則問答。內容是我假設的，接受之後請依實際情況修改。' },
      ],
    ]
  }

  if (asked.includes('重點')) {
    return only('這是一篇讀書會的活動公告，重點有三個：\n\n- **什麼活動**：十二月舉辦今年最後一場讀書會，主題是「把文件寫清楚」\n- **怎麼進行**：晚上七點開始，導讀之後分組討論，再由各組分享\n- **怎麼報名**：免費，名額二十位，十二月五日前回信報名\n\n這個問題不需要修改文件，所以我沒有提出任何修改。')
  }

  if (asked.includes('英文')) {
    const selected = blocks.filter(block => block.selected)
    if (selected.length === 0)
      return only('請先在編輯器裡選取要翻譯的那一段，再送出一次。選取的內容會顯示在輸入框上方。')
    const edits = selected.flatMap((block): ScriptStep[] => {
      const ready = english.find(([words]) => squeeze(words) === block.words)
      return ready
        ? [
            {
              tool: 'replace_block',
              input: { blockId: block.id, xml: ready[1] },
            },
          ]
        : []
    })
    if (edits.length === 0)
      return only('這是示範，我只準備了這篇文章原本的內容的翻譯。你選的這一段已經改過了，所以這次沒有提出修改。')
    return [
      [
        {
          text: selected.length === 1
            ? '好，我把你選的這一段翻成英文。'
            : `好，我把你選的 ${selected.length} 個區塊翻成英文。`,
        },
        ...edits,
      ],
      [
        {
          text: edits.length < selected.length
            ? `我提了 ${edits.length} 項修改；另外 ${selected.length - edits.length} 個區塊已經改過，示範沒有準備它們的翻譯。`
            : '翻好了，請在編輯器裡看看要不要接受。',
        },
      ],
    ]
  }

  return only(`這是示範：這裡的 AI 照寫好的劇本回應，沒有連到任何服務，只認得這幾句：「${SHORTER}」、「${TABLE}」、「${FAQ}」、「${SUMMARY}」，以及選取一段之後的「${ENGLISH}」。`)
}

/** The model for the demo page: each new message from the author starts the script that fits it. */
export function demoModel(): Model {
  let play: Model | undefined
  return (request) => {
    if (request.messages.at(-1)?.role === 'user' || !play)
      play = scriptedModel(scriptFor(request), { delay: 30, chunkSize: 3 })
    return play(request)
  }
}
