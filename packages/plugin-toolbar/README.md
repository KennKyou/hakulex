# @hakulex/plugin-toolbar

固定在編輯器上方的工具列：復原、區塊樣式、文字格式、連結和插入選單。

[hakulex](https://hakulex.dev) 的一部分：給 Vue 3 的富文本編輯器，建立在 Lexical 上。這個套件的說明和可以操作的範例在 [hakulex.dev/plugins/toolbar](https://hakulex.dev/plugins/toolbar)。

## 安裝

```bash
pnpm add @hakulex/plugin-toolbar @hakulex/editor lexical vue
```

## 樣式

套件的程式不會自己載入樣式。在應用程式的進入點引入一次，放在 `@hakulex/editor/style.css` 之後。

```ts
import '@hakulex/plugin-toolbar/style.css'
```

## 使用

```vue
<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { RichEditor, validateUrl } from '@hakulex/editor'
import { ToolbarPlugin } from '@hakulex/plugin-toolbar'
import { shallowRef } from 'vue'

const doc = shallowRef<SerializedEditorState | null>(null)
</script>

<template>
  <RichEditor v-model="doc" placeholder="選取文字，再按上方的按鈕">
    <template #toolbar>
      <ToolbarPlugin :validate-url="validateUrl" />
    </template>
  </RichEditor>
</template>
```

## 授權

[MIT](./LICENSE)
