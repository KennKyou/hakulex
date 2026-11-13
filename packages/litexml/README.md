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

## 圖片的檔案編號

圖片和圖庫裡的圖片如果有 `fileId`（應用程式自己的檔案編號，見 [`@hakulex/editor`](https://hakulex.dev/packages/editor) 的說明），會寫成 `img` 的 `file-id` 屬性，讀回來時還原成 `fileId`。空的屬性會被略過。

讀取時不會檢查這個編號和 `src` 是不是原本的那一對：LiteXML 手上只有這一段文字，沒有可以比對的文件。讓模型改寫文件時，這項檢查由 [`@hakulex/agent-core`](https://hakulex.dev/packages/agent-core) 負責。

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
