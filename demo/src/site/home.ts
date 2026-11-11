import { doc, element, FORMAT, paragraph, text } from './samples/helpers'

/* The words on the home page, and the document in its editor. */

export const REPOSITORY = 'https://github.com/KennKyou/hakulex'
export const INSTALL_PACKAGE = '@hakulex/editor'

function todo(label: string, checked = false) {
  return element('listitem', [
    text(label),
  ], { value: 1, checked })
}

/* Things to try, as a document that is itself tried: a callout, a checklist, formatted text. */
export const homeDocument = doc(
  element('heading', [
    text('試著改改看這份文件'),
  ], { tag: 'h2' }),
  paragraph(
    text('這不是截圖，是'),
    text('真的編輯器', FORMAT.bold),
    text('：直接在這裡打字，內容都存成 JSON，編輯和閱讀用同一份文件。'),
  ),
  element('alert-quote', [
    paragraph(
      text('在空白的一行打 '),
      text('/', FORMAT.code),
      text('，可以插入表格、程式碼和圖表。'),
    ),
  ], { alertType: 'tip' }),
  element('list', [
    todo('打開這個頁面', true),
    todo('選取一段文字，用浮動工具列加粗'),
    todo('用上方的工具列加一個連結'),
    todo('把這一項打勾'),
  ], { listType: 'check', start: 1, tag: 'ul' }),
)

/* What follows the accent color, in one small document: a link, and a poll's bars and button. */
export const accentDocument = doc(
  paragraph(
    text('換一個強調色，'),
    element('link', [
      text('連結'),
    ], {
      url: 'https://lexical.dev',
      rel: 'noopener noreferrer',
      target: '_blank',
      title: null,
    }),
    text('和投票都會跟著變。'),
  ),
  {
    type: 'poll',
    version: 1,
    pollId: 'p_home_accent',
    question: '這個顏色好看嗎？',
    options: [
      { id: 'o_yes', label: '好看' },
      { id: 'o_more', label: '再換一個' },
    ],
    mode: 'single',
  },
)

/*
 * Why hakulex, in four short reasons. Each is something the code does today: nothing here is a
 * number that will drift or a comparison with another editor.
 */
export const reasons = [
  {
    icon: 'vue',
    title: '為 Vue 而寫',
    text: '不是把別的框架的元件包一層。用 v-model 綁定文件，用插槽放進工具列和外掛。',
  },
  {
    icon: 'document',
    title: '一份 JSON，兩種用途',
    text: '編輯器存下來的 JSON，閱讀頁直接呈現，也能在伺服器端輸出，不用載入編輯器。',
  },
  {
    icon: 'pieces',
    title: '只裝需要的',
    text: '工具列、斜線選單、表格操作都是各自獨立的套件，沒用到的不會進到你的網站。',
  },
  {
    icon: 'check',
    title: '放心用在產品裡',
    text: '以 TypeScript 撰寫、附完整型別，有單元測試和三種瀏覽器的端對端測試，MIT 授權。',
  },
] as const
