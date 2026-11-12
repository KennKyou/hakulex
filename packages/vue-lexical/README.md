# @hakulex/vue-lexical

Lexical 的 Vue 3 綁定，想自己組編輯器時使用；一般直接用 editor 就好。

[hakulex](https://hakulex.dev) 的一部分：給 Vue 3 的富文本編輯器，建立在 Lexical 上。這個套件的說明和可以操作的範例在 [hakulex.dev/packages/vue-lexical](https://hakulex.dev/packages/vue-lexical)。

## 安裝

```bash
pnpm add @hakulex/vue-lexical lexical vue
```

## 使用

```vue
<script setup lang="ts">
import type { InitialConfig } from '@hakulex/vue-lexical'
import { ContentEditable, HistoryPlugin, LexicalComposer, RichTextPlugin } from '@hakulex/vue-lexical'

const config: InitialConfig = {
  namespace: 'my-editor',
  onError: (error) => {
    throw error
  },
}
</script>

<template>
  <LexicalComposer :initial-config="config">
    <RichTextPlugin />
    <HistoryPlugin />
    <ContentEditable class="hlx-content" placeholder="開始輸入…" />
  </LexicalComposer>
</template>
```

## 授權

[MIT](./LICENSE)
