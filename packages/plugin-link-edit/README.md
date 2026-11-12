# @hakulex/plugin-link-edit

游標在連結上時顯示面板，可以開啟、複製、修改和移除連結。

[hakulex](https://hakulex.dev) 的一部分：給 Vue 3 的富文本編輯器，建立在 Lexical 上。這個套件的說明和可以操作的範例在 [hakulex.dev/plugins/link-edit](https://hakulex.dev/plugins/link-edit)。

## 安裝

```bash
pnpm add @hakulex/plugin-link-edit @hakulex/editor lexical vue
```

## 樣式

套件的程式不會自己載入樣式。在應用程式的進入點引入一次，放在 `@hakulex/editor/style.css` 之後。

```ts
import '@hakulex/plugin-link-edit/style.css'
```

## 使用

範例裡的 `./documents` 是你自己的文件 JSON，也就是編輯器的 `v-model` 存下來的內容。

```vue
<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { RichEditor, validateUrl } from '@hakulex/editor'
import { LinkEditPlugin } from '@hakulex/plugin-link-edit'
import { shallowRef } from 'vue'
import { withLink } from './documents'

const doc = shallowRef<SerializedEditorState | null>(withLink)
</script>

<template>
  <RichEditor v-model="doc">
    <LinkEditPlugin :validate-url="validateUrl" />
  </RichEditor>
</template>
```

## 授權

[MIT](./LICENSE)
