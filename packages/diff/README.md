# @hakulex/diff

並排或單欄顯示兩個版本文件的差異。

[hakulex](https://hakulex.dev) 的一部分：給 Vue 3 的富文本編輯器，建立在 Lexical 上。這個套件的說明和可以操作的範例在 [hakulex.dev/packages/diff](https://hakulex.dev/packages/diff)。

## 安裝

```bash
pnpm add @hakulex/diff lexical vue
```

## 樣式

套件的程式不會自己載入樣式。在應用程式的進入點引入一次，另外也要引入文件內容的樣式 `@hakulex/style-token/style.css`。

```ts
import '@hakulex/diff/style.css'
```

## 使用

範例裡的 `./documents` 是你自己的文件 JSON，也就是編輯器的 `v-model` 存下來的內容。

```vue
<script setup lang="ts">
import { RichDiff } from '@hakulex/diff'
import { article, revised } from './documents'
</script>

<template>
  <RichDiff :old-value="article" :new-value="revised" layout="inline" />
</template>
```

## 授權

[MIT](./LICENSE)。部分程式碼改寫自 [haklex](https://github.com/Innei/haklex)，詳見 [NOTICE](./NOTICE)。
