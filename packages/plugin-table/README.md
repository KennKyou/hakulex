# @hakulex/plugin-table

表格的列和欄把手：增減、移動、對齊和調整欄寬。

[hakulex](https://hakulex.dev) 的一部分：給 Vue 3 的富文本編輯器，建立在 Lexical 上。這個套件的說明和可以操作的範例在 [hakulex.dev/plugins/table](https://hakulex.dev/plugins/table)。

## 安裝

```bash
pnpm add @hakulex/plugin-table @hakulex/editor lexical vue
```

## 樣式

套件的程式不會自己載入樣式。在應用程式的進入點引入一次，放在 `@hakulex/editor/style.css` 之後。

```ts
import '@hakulex/plugin-table/style.css'
```

## 使用

範例裡的 `./documents` 是你自己的文件 JSON，也就是編輯器的 `v-model` 存下來的內容。

```vue
<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { RichEditor } from '@hakulex/editor'
import { TablePlugin } from '@hakulex/plugin-table'
import { shallowRef } from 'vue'
import { withTable } from './documents'

const doc = shallowRef<SerializedEditorState | null>(withTable)
</script>

<template>
  <RichEditor v-model="doc">
    <TablePlugin />
  </RichEditor>
</template>
```

## 授權

[MIT](./LICENSE)
