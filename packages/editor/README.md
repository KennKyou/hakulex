# @hakulex/editor

編輯器本體。外掛都放在 RichEditor 裡面，文件用 v-model 綁定。

[hakulex](https://hakulex.dev) 的一部分：給 Vue 3 的富文本編輯器，建立在 Lexical 上。這個套件的說明和可以操作的範例在 [hakulex.dev/packages/editor](https://hakulex.dev/packages/editor)。

## 安裝

```bash
pnpm add @hakulex/editor lexical vue
```

## 樣式

套件的程式不會自己載入樣式。在應用程式的進入點引入一次；這個檔案包含設計 token、內容排版和編輯器本身的樣式。

```ts
import '@hakulex/editor/style.css'
```

## 使用

```vue
<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { RichEditor } from '@hakulex/editor'
import { shallowRef } from 'vue'

const doc = shallowRef<SerializedEditorState | null>(null)
</script>

<template>
  <RichEditor v-model="doc" placeholder="開始輸入…" />
</template>
```

## 上傳圖片

給 `uploadImage`，作者就能從電腦選圖、貼上或拖曳圖片進來。它收到檔案，把檔案存到你的儲存空間，回傳圖片的網址：

```vue
<script setup lang="ts">
import type { UploadImage } from '@hakulex/editor'
import type { SerializedEditorState } from 'lexical'
import { RichEditor } from '@hakulex/editor'
import { shallowRef } from 'vue'

const doc = shallowRef<SerializedEditorState | null>(null)

const uploadImage: UploadImage = async (file) => {
  const body = new FormData()
  body.append('file', file)
  const stored = await fetch('/api/files', { method: 'POST', body }).then(response => response.json())
  return { src: stored.url, fileId: stored.id }
}
</script>

<template>
  <RichEditor v-model="doc" :upload-image="uploadImage" />
</template>
```

回傳的物件裡 `src` 是必要的，`width`、`height` 和 `altText` 可以不給。丟出的錯誤會顯示給作者看。

### 檔案編號 `fileId`

`fileId` 是選用的：你的應用程式替這個檔案取的編號。給了非空的字串，它就會存進文件，讓你不用從網址反查，就能知道一份文件用到了哪些檔案。

- 單張圖片存在節點的 `fileId`；圖庫存在 `images` 裡那一張的 `fileId`。
- 它只被保存，不影響顯示。改替代文字、圖說、寬度或版面，以及複製貼上，都會留著。
- 它跟著那一張圖：圖片的網址換掉時會移除，除非換上的是另一次帶 `fileId` 的上傳。
- LiteXML 用 `img` 的 `file-id` 屬性讀寫它。

**不要直接相信文件裡的 `fileId`。** 文件的 JSON 可以被修改，也可以從別的文件或別的網站貼過來，所以裡面的編號不一定屬於正在編輯的這位使用者。在伺服器端拿它做判斷之前（例如「這個檔案還有文章在用，不能刪」），先確認這個編號是你的檔案、而且這位使用者有權使用它。

## 授權

[MIT](./LICENSE)
