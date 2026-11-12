# @hakulex/editor

編輯器本體。外掛都放在 RichEditor 裡面，文件用 v-model 綁定。

[hakulex](https://hakulex.dev) 的一部分：給 Vue 3 的富文本編輯器，建立在 Lexical 上。這個套件的說明和可以操作的範例在 [hakulex.dev/packages/editor](https://hakulex.dev/packages/editor)。

## 安裝

```bash
pnpm add @hakulex/editor lexical vue
```

## 樣式

套件的程式不會自己載入樣式。在應用程式的進入點引入一次；這個檔案包含設計 token、內容排版和編輯器本身的樣式。

```ts
import '@hakulex/editor/style.css'
```

## 使用

```vue
<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { RichEditor } from '@hakulex/editor'
import { shallowRef } from 'vue'

const doc = shallowRef<SerializedEditorState | null>(null)
</script>

<template>
  <RichEditor v-model="doc" placeholder="開始輸入…" />
</template>
```

## 授權

[MIT](./LICENSE)
