# @hakulex/litexml-cli

litexml 指令，在終端機把 LiteXML 或文件 JSON 轉成 HTML、JSON 或 Markdown。

[hakulex](https://hakulex.dev) 的一部分：給 Vue 3 的富文本編輯器，建立在 Lexical 上。這個套件的說明和可以操作的範例在 [hakulex.dev/packages/litexml-cli](https://hakulex.dev/packages/litexml-cli)。

## 安裝

```bash
pnpm add -g @hakulex/litexml-cli
```

## 使用

```bash
# 轉成排版好的 HTML，並用瀏覽器打開
litexml post.xml --format html --open

# 轉成文件 JSON，寫到檔案
litexml post.xml --format json -o post.json

# 從標準輸入讀取，轉成 Markdown
cat post.xml | litexml - --format markdown

# 把文件 JSON 轉成深色的 HTML
litexml post.json --input-format json --format html --theme dark -o post.html
```

## 授權

[MIT](./LICENSE)。部分程式碼改寫自 [haklex](https://github.com/Innei/haklex)，詳見 [NOTICE](./NOTICE)。
