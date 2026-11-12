# @hakulex/headless

不需要瀏覽器畫面就能讀取文件並轉成 Markdown，主要用在伺服器。

[hakulex](https://hakulex.dev) 的一部分：給 Vue 3 的富文本編輯器，建立在 Lexical 上。這個套件的說明和可以操作的範例在 [hakulex.dev/packages/headless](https://hakulex.dev/packages/headless)。

## 安裝

```bash
pnpm add @hakulex/headless lexical
```

## 使用

範例裡的 `./documents` 是你自己的文件 JSON，也就是編輯器的 `v-model` 存下來的內容。

```vue
<script setup lang="ts">
import { $toMarkdown, allHeadlessNodes } from '@hakulex/headless'
import { createHeadlessEditor } from '@lexical/headless'
import { article } from './documents'

const editor = createHeadlessEditor({
  nodes: allHeadlessNodes,
  onError: (error) => {
    throw error
  },
})
const markdown = editor.parseEditorState(JSON.stringify(article)).read(() => $toMarkdown())
</script>

<template>
  <pre>{{ markdown }}</pre>
</template>
```

## 授權

[MIT](./LICENSE)。部分程式碼改寫自 [haklex](https://github.com/Innei/haklex)，詳見 [NOTICE](./NOTICE)。
