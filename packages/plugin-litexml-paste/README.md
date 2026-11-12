# @hakulex/plugin-litexml-paste

貼上 LiteXML 文字時變成對應的區塊，適合貼上 AI 產生的內容。

[hakulex](https://hakulex.dev) 的一部分：給 Vue 3 的富文本編輯器，建立在 Lexical 上。這個套件的說明和可以操作的範例在 [hakulex.dev/plugins/litexml-paste](https://hakulex.dev/plugins/litexml-paste)。

## 安裝

```bash
pnpm add @hakulex/plugin-litexml-paste @hakulex/editor lexical vue
```

## 使用

```vue
<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { RichEditor } from '@hakulex/editor'
import { LiteXmlPastePlugin } from '@hakulex/plugin-litexml-paste'
import { shallowRef } from 'vue'

const doc = shallowRef<SerializedEditorState | null>(null)
</script>

<template>
  <RichEditor v-model="doc" placeholder="把 LiteXML 貼在這裡">
    <LiteXmlPastePlugin />
  </RichEditor>
</template>
```

## 授權

[MIT](./LICENSE)
