/** The help, printed for -h and after every error. */
export const HELP = `用法：
  litexml <輸入> --format <格式> [選項]
  litexml - --format <格式> < input.xml [選項]

輸入：
  <輸入>                    檔案路徑、"-"（從標準輸入讀）或直接寫內容。
                            依第一個不是空白的字元判斷格式：
                            "<" 是 LiteXML，"{" 是 JSON。可以用 --input-format 指定。

選項：
  -f, --format <格式>       輸出的格式：html | json | markdown。必填。
  -i, --input-format <格式> 指定輸入的格式：litexml | json。預設自動判斷。
  -o, --output <檔案>       寫進檔案，不輸出到標準輸出。
  --compact                 JSON 輸出成一行。（只用於 json）
  --theme <light|dark>      HTML 的配色。預設 light。（只用於 html）
  --variant <樣式>          HTML 的樣式：article | note | comment。預設 article。（只用於 html）
  --title <標題>            HTML 的 <title>。（只用於 html）
  --lang <語言>             HTML 的 lang。預設 zh-Hant。（只用於 html）
  --open                    用系統的瀏覽器打開產生的 HTML。（只用於 html）
  -h, --help                顯示這份說明。
`
