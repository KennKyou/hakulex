import { doc, element, paragraph, text } from '../samples/helpers'

/*
 * The document the AI page starts from: a made-up announcement, written a little long-winded
 * on purpose, so that there is something to tidy. The scripts find its blocks by these words.
 */

export const TITLE = '十二月讀書會：把文件寫清楚'
export const INTRO = '大家好，首先非常感謝各位一直以來對讀書會的支持與參與，在這邊想要跟大家宣布一個消息，那就是我們預計將會在十二月的時候舉辦今年度的最後一場讀書會活動。'
export const TOPIC = '這一次的主題，經過我們內部多次的討論之後，最後決定是「把文件寫清楚」，基本上就是希望能夠讓大家一起來聊一聊平常在寫文件的時候會遇到的各式各樣的問題。'
export const AGENDA_HEADING = '議程'
export const AGENDA: [time: string, what: string][] = [
  ['19:00', '報到與自我介紹'],
  ['19:20', '導讀：為什麼文件總是沒人看'],
  ['20:00', '分組討論'],
  ['20:40', '各組分享與總結'],
]
export const QUOTE = '寫得清楚，是對讀者的體貼。'
export const SIGNUP_HEADING = '報名方式'
export const SIGNUP = '活動免費，名額二十位。請在十二月五日前回覆這封信報名，並告訴我們你最想聊的一個問題。'

function heading(tag: string, value: string) {
  return element('heading', [
    text(value),
  ], { tag })
}

/** A new copy each time: the editor is free to change what it is given. */
export function announcement() {
  return doc(
    heading('h1', TITLE),
    paragraph(text(INTRO)),
    paragraph(text(TOPIC)),
    heading('h2', AGENDA_HEADING),
    element('list', AGENDA.map(([time, what], index) => element('listitem', [
      text(`${time} ${what}`),
    ], { value: index + 1 })), {
      listType: 'bullet',
      start: 1,
      tag: 'ul',
    }),
    element('quote', [
      text(QUOTE),
    ]),
    heading('h2', SIGNUP_HEADING),
    paragraph(text(SIGNUP)),
  )
}
