# @hakulex/renderer

把文件 JSON 呈現成 Vue 元件，可以在伺服器端執行，不需要 Lexical。

[hakulex](https://hakulex.dev) 的一部分：給 Vue 3 的富文本編輯器，建立在 Lexical 上。這個套件的說明和可以操作的範例在 [hakulex.dev/packages/renderer](https://hakulex.dev/packages/renderer)。

## 安裝

```bash
pnpm add @hakulex/renderer @hakulex/style-token vue
```

## 樣式

文件內容的樣式在 `@hakulex/style-token`，在應用程式的進入點引入一次：

```ts
import '@hakulex/style-token/style.css'
```

## 使用

範例裡的 `./documents` 是你自己的文件 JSON，也就是編輯器的 `v-model` 存下來的內容。

```vue
<script setup lang="ts">
import { RichRenderer } from '@hakulex/renderer'
import { article } from './documents'
</script>

<template>
  <RichRenderer :value="article" variant="article" />
</template>
```

## 授權

[MIT](./LICENSE)
