/*
 * The plugins and packages the site has a page for. Plain data, so that E2E can import the
 * list. What each one runs and shows as code is its file in `examples/`.
 */

export type PackageKind = 'plugin' | 'package'

export interface PropDoc {
  name: string
  type: string
  description: string
}

export interface PackageEntry {
  id: string
  kind: PackageKind
  label: string
  packageName: string
  description: string
  /** How to try the demo. */
  hint?: string
  /** Text for the reader to copy into the demo. */
  tryText?: string
  /** Plugins only; an empty list is a plugin with nothing to set. */
  props?: PropDoc[]
  /** Instead of an example, for what doesn't run in a page. */
  commands?: string
}

const validateUrl: PropDoc = {
  name: 'validateUrl',
  type: '(url: string) => boolean',
  description: '在連結進入編輯器前檢查網址，不通過時顯示錯誤。',
}

const LITEXML_SAMPLE = `<doc>
  <h2>發布前的檢查</h2>
  <p>這篇是 <b>草稿</b>，週五前要改完。</p>
  <alert type="warning">
    <p>還沒有人審過</p>
  </alert>
  <ul>
    <li>確認標題</li>
    <li>補上圖片說明</li>
  </ul>
</doc>`

function plugin(entry: Omit<PackageEntry, 'kind' | 'packageName'>): PackageEntry {
  return {
    ...entry,
    kind: 'plugin',
    packageName: `@hakulex/plugin-${entry.id}`,
  }
}

function pack(entry: Omit<PackageEntry, 'kind' | 'packageName' | 'label'>): PackageEntry {
  return {
    ...entry,
    kind: 'package',
    label: entry.id,
    packageName: `@hakulex/${entry.id}`,
  }
}

export const packages: PackageEntry[] = [
  plugin({
    id: 'toolbar',
    label: '工具列',
    description: '固定在編輯器上方的工具列：復原、區塊樣式、文字格式、連結和插入選單。',
    hint: '選取文字後按上方的按鈕，或打開「插入」選單。',
    props: [validateUrl],
  }),
  plugin({
    id: 'floating-toolbar',
    label: '浮動工具列',
    description: '選取文字時出現在選取範圍旁的格式工具列。',
    hint: '選取一段文字。',
    props: [validateUrl],
  }),
  plugin({
    id: 'slash-menu',
    label: '斜線選單',
    description: '在空白處打 / 插入區塊，繼續打字可以篩選。',
    hint: '打 / 開啟選單，用方向鍵和 Enter 選擇。',
    props: [
      {
        name: 'items',
        type: 'SlashMenuItem[]',
        description: '選單項目，預設是全部內建項目；要增加時寫成 [...builtinSlashItems, myItem]。',
      },
    ],
  }),
  plugin({
    id: 'mention',
    label: '提及選單',
    description: '打 @ 提及社群平台上的帳號。',
    hint: '打 @ 開啟選單，選平台後輸入帳號。',
    props: [],
  }),
  plugin({
    id: 'link-edit',
    label: '連結面板',
    description: '游標在連結上時顯示面板，可以開啟、複製、修改和移除連結。',
    hint: '點一下文字裡的連結。',
    props: [validateUrl],
  }),
  plugin({
    id: 'block-handle',
    label: '區塊把手',
    description: '區塊左側的把手，可以拖曳、移動、複製區塊或轉換類型。',
    hint: '把滑鼠移到段落上，用左邊出現的把手。',
    props: [],
  }),
  plugin({
    id: 'table',
    label: '表格操作',
    description: '表格的列和欄把手：增減、移動、對齊和調整欄寬。',
    hint: '點一個儲存格，用列和欄上出現的把手。',
    props: [],
  }),
  plugin({
    id: 'image-editor',
    label: '圖片編輯',
    description: '在待插入的圖片清單裡裁切、標註、打馬賽克和調整大小。',
    hint: '在「插入」選單選「圖片」，選一張圖片後按「編輯」。',
    props: [],
  }),
  plugin({
    id: 'litexml-paste',
    label: 'LiteXML 貼上',
    description: '貼上 LiteXML 文字時變成對應的區塊，適合貼上 AI 產生的內容。',
    hint: '複製下面的文字，貼到編輯器裡。',
    tryText: LITEXML_SAMPLE,
    props: [],
  }),

  pack({
    id: 'editor',
    description: '編輯器本體。外掛都放在 RichEditor 裡面，文件用 v-model 綁定。',
    hint: '這是沒有任何外掛的編輯器，試試 # 標題或 **粗體** 這些 Markdown 寫法。',
  }),
  pack({
    id: 'renderer',
    description: '把文件 JSON 呈現成 Vue 元件，可以在伺服器端執行，不需要 Lexical。',
  }),
  pack({
    id: 'diff',
    description: '並排或單欄顯示兩個版本文件的差異。',
  }),
  pack({
    id: 'diff-core',
    description: '比對兩份文件的核心邏輯，例如算出字數和區塊的變更統計，不含畫面。',
  }),
  pack({
    id: 'litexml',
    description: '在文件 JSON 和 LiteXML 之間轉換，LiteXML 是給 AI 讀寫的精簡 XML 格式。',
  }),
  pack({
    id: 'litexml-cli',
    description: 'litexml 指令，在終端機把 LiteXML 或文件 JSON 轉成 HTML、JSON 或 Markdown。',
    commands: `# 轉成排版好的 HTML，並用瀏覽器打開
litexml post.xml --format html --open

# 轉成文件 JSON，寫到檔案
litexml post.xml --format json -o post.json

# 從標準輸入讀取，轉成 Markdown
cat post.xml | litexml - --format markdown

# 把文件 JSON 轉成深色的 HTML
litexml post.json --input-format json --format html --theme dark -o post.html`,
  }),
  pack({
    id: 'headless',
    description: '不需要瀏覽器畫面就能讀取文件並轉成 Markdown，主要用在伺服器。這裡直接在頁面上執行。',
  }),
  pack({
    id: 'style-token',
    description: '設計 token、CSS 變數和各種排版的預設值，可以用 ThemeTokens 覆寫。',
  }),
  pack({
    id: 'vue-lexical',
    description: 'Lexical 的 Vue 3 綁定，想自己組編輯器時使用；一般直接用 editor 就好。',
    hint: '這個編輯器只有 Lexical 的基本功能，試著打字和復原。',
  }),
]

export const packagesOf = (kind: PackageKind) => packages.filter(entry => entry.kind === kind)

export const findPackage = (kind: PackageKind, id: unknown) => packagesOf(kind).find(entry => entry.id === id)

export function neighbouringPackages(entry: PackageEntry): { previous?: PackageEntry, next?: PackageEntry } {
  const list = packagesOf(entry.kind)
  const index = list.indexOf(entry)
  return {
    previous: list[index - 1],
    next: list[index + 1],
  }
}

export function packagesPath(kind: PackageKind) {
  return kind === 'plugin'
    ? '/plugins'
    : '/packages'
}
