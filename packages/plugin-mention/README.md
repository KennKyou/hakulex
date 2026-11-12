# @hakulex/plugin-mention

打 @ 提及社群平台上的帳號。

[hakulex](https://hakulex.dev) 的一部分：給 Vue 3 的富文本編輯器，建立在 Lexical 上。這個套件的說明和可以操作的範例在 [hakulex.dev/plugins/mention](https://hakulex.dev/plugins/mention)。

## 安裝

```bash
pnpm add @hakulex/plugin-mention @hakulex/editor lexical vue
```

## 樣式

套件的程式不會自己載入樣式。在應用程式的進入點引入一次，放在 `@hakulex/editor/style.css` 之後。

```ts
import '@hakulex/plugin-mention/style.css'
```

## 使用

```vue
<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { RichEditor } from '@hakulex/editor'
import { MentionMenuPlugin } from '@hakulex/plugin-mention'
import { shallowRef } from 'vue'

const doc = shallowRef<SerializedEditorState | null>(null)
</script>

<template>
  <RichEditor v-model="doc" placeholder="打 @ 提及帳號">
    <MentionMenuPlugin />
  </RichEditor>
</template>
```

## 授權

[MIT](./LICENSE)
