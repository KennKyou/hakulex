# @hakulex/litexml

在文件 JSON 和 LiteXML 之間轉換，LiteXML 是給 AI 讀寫的精簡 XML 格式。

[hakulex](https://hakulex.dev) 的一部分：給 Vue 3 的富文本編輯器，建立在 Lexical 上。這個套件的說明和可以操作的範例在 [hakulex.dev/packages/litexml](https://hakulex.dev/packages/litexml)。

## 安裝

```bash
pnpm add @hakulex/litexml lexical
```

## 使用

範例裡的 `./documents` 是你自己的文件 JSON，也就是編輯器的 `v-model` 存下來的內容。

```vue
<script setup lang="ts">
import { createDefaultRegistry, serializeToXml } from '@hakulex/litexml'
import { article } from './documents'

const xml = serializeToXml(article, createDefaultRegistry())
</script>

<template>
  <pre>{{ xml }}</pre>
</template>
```

## 檢查

`deserializeFromXml` 和 `deserializeNodesFromXml` 讀取時很寬鬆：格式有錯會盡量讀，不認得的標籤會略過，不會報錯。要知道一段 LiteXML 哪裡寫錯（例如檢查程式或模型產生的內容），用 `checkXml`：

```ts
import { checkXml, createDefaultRegistry } from '@hakulex/litexml'

const problems = checkXml('<p>沒有關<b>粗體</p>', createDefaultRegistry())
// [{ kind: 'malformed', tag: 'b', message: '<b> is never closed. Add </b>.', index: 7 }]
```

回傳空陣列表示沒有找到問題。`kind` 有三種：`malformed`（標籤沒有成對、屬性的引號沒有關、文字裡有沒跳脫的 `<`）、`unknown-tag`（不是 LiteXML 的標籤）、`empty`（沒有內容）。自己註冊的讀取函式如果會處理內層的標籤，用第三個參數 `{ knownTags: ['…'] }` 告訴它。

## 授權

[MIT](./LICENSE)。部分程式碼改寫自 [haklex](https://github.com/Innei/haklex)，詳見 [NOTICE](./NOTICE)。
