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

## 選擇網站已有的圖片

圖片已經存在你的媒體庫、素材庫或其他地方時，給 `pickImages`，作者就能直接選一張已有的圖片，不用重新上傳。編輯器不知道圖片在哪裡：插入圖片的對話框和圖庫多一個按鈕，按下時呼叫這個函式，由你打開自己的選擇畫面，再回傳作者選了哪些圖片。

```vue
<script setup lang="ts">
import type { PickImages } from '@hakulex/editor'
import type { SerializedEditorState } from 'lexical'
import { RichEditor } from '@hakulex/editor'
import { shallowRef } from 'vue'
import { openMediaLibrary } from './media-library'

const doc = shallowRef<SerializedEditorState | null>(null)

const pickImages: PickImages = async ({ multiple, signal }) => {
  // 編輯器的對話框先關掉時，signal 會中止：把你的選擇畫面也關掉。
  const files = await openMediaLibrary({ multiple, signal })
  return files.map(file => ({
    src: file.url,
    width: file.width,
    height: file.height,
    fileId: file.id
  }))
}
</script>

<template>
  <RichEditor v-model="doc" :pick-images="pickImages" pick-images-label="從媒體庫選擇" />
</template>
```

- 函式收到 `purpose`（`'insert'`、`'replace'` 或 `'gallery'`）、`multiple`（替換一張圖片時是 `false`）和 `signal`。回傳空陣列表示作者沒有選；丟出的錯誤會以「選擇失敗：…」顯示給作者。
- 回傳的每一張和 `uploadImage` 的結果一樣檢查：網址要安全，沒有寬高就載入圖片量取，`fileId` 是非空字串才保留。不能用的那張不加入，並告訴作者原因，其他照常加入。這個檢查也以 `toImageData` 匯出，寫測試時可以用。
- 插入圖片時，選來的圖片和上傳的檔案列在同一份清單裡，插入時不會再上傳，也不能用圖片編輯器編輯。替換時只用回傳的第一張。圖庫把它們加在最後。
- 編輯器不限制一次能選幾張，要限制就在你的選擇畫面裡處理。
- 你的選擇畫面開著的時候，編輯器的對話框不搶焦點，也不處理 Esc 和點外面關閉，所以作者在你的畫面按 Esc 只會關掉你的畫面。編輯器的對話框被關閉（取消、編輯器卸載）時 `signal` 會中止，之後才回來的結果會被忽略。
- 按鈕文字預設是「選擇圖片」，用 `pickImagesLabel` 換掉。沒有給 `pickImages` 時，畫面和以前一樣。

### 不提供網址輸入 `allowImageUrl`

預設作者也可以輸入圖片網址。如果你的網站要求每張圖片都有 `fileId`（網址輸入的圖片沒有），設成 `false`：插入圖片的對話框和圖庫都不再提供網址輸入，圖片只能上傳或用 `pickImages` 選。

```vue
<RichEditor v-model="doc" :upload-image="uploadImage" :pick-images="pickImages" :allow-image-url="false" />
```

## 授權

[MIT](./LICENSE)
