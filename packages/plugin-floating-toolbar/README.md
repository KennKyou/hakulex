# @hakulex/plugin-floating-toolbar

選取文字時出現在選取範圍旁的格式工具列。

[hakulex](https://hakulex.dev) 的一部分：給 Vue 3 的富文本編輯器，建立在 Lexical 上。這個套件的說明和可以操作的範例在 [hakulex.dev/plugins/floating-toolbar](https://hakulex.dev/plugins/floating-toolbar)。

## 安裝

```bash
pnpm add @hakulex/plugin-floating-toolbar @hakulex/editor lexical vue
```

## 樣式

套件的程式不會自己載入樣式。在應用程式的進入點引入一次，放在 `@hakulex/editor/style.css` 之後。

```ts
import '@hakulex/plugin-floating-toolbar/style.css'
```

## 使用

範例裡的 `./documents` 是你自己的文件 JSON，也就是編輯器的 `v-model` 存下來的內容。

```vue
<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { RichEditor, validateUrl } from '@hakulex/editor'
import { FloatingToolbarPlugin } from '@hakulex/plugin-floating-toolbar'
import { shallowRef } from 'vue'
import { paragraphs } from './documents'

const doc = shallowRef<SerializedEditorState | null>(paragraphs)
</script>

<template>
  <RichEditor v-model="doc">
    <FloatingToolbarPlugin :validate-url="validateUrl" />
  </RichEditor>
</template>
```

## 授權

[MIT](./LICENSE)
