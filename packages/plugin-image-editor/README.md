# @hakulex/plugin-image-editor

在待插入的圖片清單裡裁切、標註、打馬賽克和調整大小。

[hakulex](https://hakulex.dev) 的一部分：給 Vue 3 的富文本編輯器，建立在 Lexical 上。這個套件的說明和可以操作的範例在 [hakulex.dev/plugins/image-editor](https://hakulex.dev/plugins/image-editor)。

## 安裝

```bash
pnpm add @hakulex/plugin-image-editor vue
```

## 樣式

套件的程式不會自己載入樣式。在應用程式的進入點引入一次，放在 `@hakulex/editor/style.css` 之後。

```ts
import '@hakulex/plugin-image-editor/style.css'
```

## 使用

```vue
<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { RichEditor, validateUrl } from '@hakulex/editor'
import { ImageEditorPlugin } from '@hakulex/plugin-image-editor'
import { ToolbarPlugin } from '@hakulex/plugin-toolbar'
import { shallowRef } from 'vue'

const doc = shallowRef<SerializedEditorState | null>(null)

// Replace this with an upload to your own storage.
async function uploadImage(file: File) {
  const { width, height } = await createImageBitmap(file)
  return {
    src: URL.createObjectURL(file),
    width,
    height,
  }
}
</script>

<template>
  <RichEditor v-model="doc" :upload-image="uploadImage" placeholder="在「插入」選單選擇圖片">
    <template #toolbar>
      <ToolbarPlugin :validate-url="validateUrl" />
    </template>
    <ImageEditorPlugin />
  </RichEditor>
</template>
```

## 授權上的注意事項

標註功能使用 [marker.js](https://markerjs.com)。它的授權要求畫面上保留連回官網的連結（這個外掛已經內建），否則需要購買商業授權；使用這個外掛時也受這個條件約束。

## 授權

[MIT](./LICENSE)。部分程式碼改寫自 [haklex](https://github.com/Innei/haklex)，詳見 [NOTICE](./NOTICE)。
