# @hakulex/plugin-block-id

替文件最上層的每個區塊加上一個不會變的編號，讓其他功能可以指出「哪一個區塊」。

[hakulex](https://hakulex.dev) 的一部分：給 Vue 3 的富文本編輯器，建立在 Lexical 上。這個套件的說明和可以操作的範例在 [hakulex.dev/plugins/block-id](https://hakulex.dev/plugins/block-id)。

## 安裝

```bash
pnpm add @hakulex/plugin-block-id @hakulex/editor lexical vue
```

這個套件沒有樣式，不需要引入 CSS。

## 使用

```vue
<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { RichEditor } from '@hakulex/editor'
import { BlockIdPlugin } from '@hakulex/plugin-block-id'
import { shallowRef } from 'vue'

const doc = shallowRef<SerializedEditorState | null>(null)
</script>

<template>
  <RichEditor v-model="doc">
    <BlockIdPlugin />
  </RichEditor>
</template>
```

## 它做什麼

- 最上層的每個區塊（段落、標題、清單、表格、圖片⋯⋯）都有一個 8 個字元的編號，文件裡不重複。
- 編號存在文件裡，每個區塊的 `$.blockId`，會跟著 `v-model` 送出並存檔。**裝了這個外掛，你的文件內容就會多出這個欄位。**
- 修改文字、移動區塊、復原和重做都不會改變編號。把段落改成標題這類換一種區塊的操作，沿用原來的編號。
- 複製出來的區塊會得到新的編號，原本的保留。
- 打開一份還沒有編號的文件時會補上，但這不算一次修改：不發出 `update:modelValue`，等使用者真的編輯時才一起送出。
- 編輯器唯讀（`editable` 為 `false`）時不寫入任何東西。
- 只管最外層文件的最上層區塊。清單項目、表格儲存格、巢狀文件、格子和步驟裡面的內容不編號。
- 頁面上每個最上層區塊的元素有 `data-block-id` 屬性。

編號的格式和 haklex 相同，從 haklex 來的文件會沿用原有的編號。

## 讀取編號

```ts
import { $getBlockById, $getBlockId } from '@hakulex/plugin-block-id'
import { $getRoot } from 'lexical'

editor.getEditorState().read(() => {
  const first = $getRoot().getFirstChild()
  const id = first && $getBlockId(first) // 沒有編號時是空字串
  const block = $getBlockById('aB3_x-9Z') // 找不到時是 null
})
```

| 匯出 | 說明 |
| --- | --- |
| `BlockIdPlugin` | 外掛元件，放在 `RichEditor` 裡面。沒有 props。 |
| `$getBlockId(node)` | 讀一個區塊的編號。 |
| `$getBlockById(id)` | 用編號找最上層的區塊。 |
| `createBlockId()` | 產生一個新的編號。 |
| `blockIdState` | 編號在節點上存放的位置，給 Lexical 的 `$getState` 和 `$setState` 用。 |

用 `@hakulex/litexml` 轉成 LiteXML 時，編號會出現在每個區塊的 `id` 屬性上。

## 授權

[MIT](./LICENSE)
