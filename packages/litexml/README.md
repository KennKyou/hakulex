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

## 授權

[MIT](./LICENSE)。部分程式碼改寫自 [haklex](https://github.com/Innei/haklex)，詳見 [NOTICE](./NOTICE)。
