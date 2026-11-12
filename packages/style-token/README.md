# @hakulex/style-token

設計 token、CSS 變數和各種排版的預設值，可以用 ThemeTokens 覆寫。

[hakulex](https://hakulex.dev) 的一部分：給 Vue 3 的富文本編輯器，建立在 Lexical 上。這個套件的說明和可以操作的範例在 [hakulex.dev/packages/style-token](https://hakulex.dev/packages/style-token)。

## 安裝

```bash
pnpm add @hakulex/style-token
```

## 樣式

套件的程式不會自己載入樣式。在應用程式的進入點引入一次；這個檔案包含設計 token 和內容排版。使用 `@hakulex/editor` 的話改引入 `@hakulex/editor/style.css`，裡面已經包含這些。

```ts
import '@hakulex/style-token/style.css'
```

## 使用

範例裡的 `./documents` 是你自己的文件 JSON，也就是編輯器的 `v-model` 存下來的內容。

```vue
<script setup lang="ts">
import type { ThemeTokens } from '@hakulex/style-token'
import { RichRenderer } from '@hakulex/renderer'
import { article } from './documents'

const theme: ThemeTokens = {
  color: {
    text: '#1d4ed8',
    bg: '#eff6ff',
  },
}
</script>

<template>
  <RichRenderer :value="article" :theme="theme" />
</template>
```

## 授權

[MIT](./LICENSE)
