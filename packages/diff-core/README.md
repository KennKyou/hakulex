# @hakulex/diff-core

比對兩份文件的核心邏輯，例如算出字數和區塊的變更統計，不含畫面。

[hakulex](https://hakulex.dev) 的一部分：給 Vue 3 的富文本編輯器，建立在 Lexical 上。這個套件的說明和可以操作的範例在 [hakulex.dev/packages/diff-core](https://hakulex.dev/packages/diff-core)。

## 安裝

```bash
pnpm add @hakulex/diff-core lexical
```

## 使用

範例裡的 `./documents` 是你自己的文件 JSON，也就是編輯器的 `v-model` 存下來的內容。

```vue
<script setup lang="ts">
import { computeDeltaStats, formatDeltaStats } from '@hakulex/diff-core'
import { article, revised } from './documents'

const stats = computeDeltaStats(article, revised)
</script>

<template>
  <pre>{{ formatDeltaStats(stats) }}</pre>
</template>
```

## 授權

[MIT](./LICENSE)。部分程式碼改寫自 [haklex](https://github.com/Innei/haklex)，詳見 [NOTICE](./NOTICE)。
