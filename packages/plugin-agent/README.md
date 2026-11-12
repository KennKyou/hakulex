# @hakulex/plugin-agent

把 AI 提議的修改顯示在編輯器裡它要改的區塊旁邊，讓人逐項接受或拒絕。接受的會寫進文件，並且可以復原。

[hakulex](https://hakulex.dev) 的一部分：給 Vue 3 的富文本編輯器，建立在 Lexical 上。這個套件的說明和可以操作的範例在 [hakulex.dev/plugins/agent](https://hakulex.dev/plugins/agent)。

## 安裝

```bash
pnpm add @hakulex/plugin-agent @hakulex/agent-core @hakulex/editor lexical vue
```

在你的進入點引入樣式，放在 `@hakulex/editor/style.css` 之後：

```ts
import '@hakulex/plugin-agent/style.css'
```

不用另外安裝 `@hakulex/plugin-block-id`：這個外掛自己會替區塊編號。裝了它之後，文件的每個最上層區塊會多一個 `$.blockId` 欄位。

## 使用

```vue
<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { claudeModel } from '@hakulex/agent-core'
import { RichEditor } from '@hakulex/editor'
import { AgentPlugin, useAgent } from '@hakulex/plugin-agent'
import { shallowRef } from 'vue'

const doc = shallowRef<SerializedEditorState | null>(null)

// 模型由你提供。這裡的 send 把請求送到你自己的後端，由後端加上金鑰再轉送。
const agent = useAgent({
  model: claudeModel({
    model: 'claude-opus-5-5',
    send: (body, signal) => fetch('/api/claude', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    }),
  }),
})
</script>

<template>
  <RichEditor v-model="doc">
    <AgentPlugin :agent="agent" />
  </RichEditor>
  <button type="button" :disabled="!agent.ready.value" @click="agent.send('把這篇改得精簡一點')">
    讓 AI 修改
  </button>
</template>
```

模型的選擇、`claudeModel` 的說明，以及不連任何服務就能試用的 `scriptedModel`，見 [`@hakulex/agent-core`](https://hakulex.dev/packages/agent-core)。整份文件會送給你接的模型服務。

## 它做什麼

- **修改文字**：新舊合併成一段，顯示在原本的位置。被拿掉的字劃掉、新加的字標色。原本那一段在你回答之前被蓋住，不能編輯，游標也會跳過它。
- **其他的修改**（表格、圖片、程式碼，或換了區塊的種類）：原本的區塊留在原位並標示，提議的新內容顯示在它下方。
- **刪除**：整個區塊劃掉。
- **新增**：新的內容以文件的樣子顯示在它會出現的位置，並標色。
- 每一項右邊有 ✓（接受）和 ✕（拒絕）。接受是編輯器的一個復原步驟：按復原會退回，那一項也會回來。
- **衝突**：AI 提議之後，那個區塊的內容又變了（例如上一段被合併進來）。原本的區塊照常顯示，由你選「保留我的」或「改用 AI 的」。
- 編輯器下方的審查列顯示還有幾項，可以逐項走過，或全部接受、全部拒絕。「全部接受」不會套用衝突的項目。
- 這些顯示不是文件的一部分：`v-model` 的內容和復原紀錄裡不會有它們。被蓋住的段落在文件裡仍然是原本的內容。
- 編輯器唯讀（`editable` 為 `false`）時只顯示，不能接受或拒絕。

## `useAgent(options)`

`options` 和 `@hakulex/agent-core` 的 `createAgent` 相同，只是不用給 `getDocument`：文件來自編輯器。它可以在任何地方建立；放進 `<AgentPlugin>` 之後才接上編輯器。

| 成員 | 說明 |
| --- | --- |
| `state` | `ShallowRef`：`status`（`idle`、`running`、`error`）、`messages`、`proposal`。 |
| `items` | `ShallowRef`：還需要回答的項目，也就是待審和衝突的。接受的會離開這份清單，復原後回來。 |
| `ready` | `Ref<boolean>`：是否已經接上編輯器。接上之前 `send` 會被拒絕。 |
| `send(text, { selection })` | 送出使用者的話。 |
| `stop()`、`retry()` | 中止這一輪；錯誤之後重試。 |
| `accept(itemId, { overwrite })`、`acceptAll()` | 接受並寫進編輯器。回傳 `{ ok, document, reason }`。 |
| `reject(itemId)`、`rejectAll()` | 拒絕。 |
| `selection()` | 編輯器目前的選取，可以直接傳給 `send`：一段文字和它所在的區塊、跨越的幾個區塊，或沒有選取時的 `undefined`。 |
| `snapshot()` | 目前的對話和提議，可以轉成 JSON 保存，之後傳給 `useAgent({ snapshot })`。 |

樣板裡可以直接使用 `agent.state.value` 和 `agent.items.value`。

## `<AgentPlugin>`

| Prop | 型別 | 說明 |
| --- | --- | --- |
| `agent` | `AgentController` | 用 `useAgent` 建立的 agent。 |
| `bar` | `boolean` | 是否顯示審查列，預設 `true`。 |

## 限制

- 以最上層的區塊為單位。巢狀文件、格子和步驟裡面的內容不會被個別修改。
- 提議的內容不能直接編輯；有提議的文字段落也要先接受或拒絕才能再改。
- 對話和還沒回答的提議只在記憶體裡，重新整理頁面就沒有了，除非你保存 `snapshot()`。

## 授權

[MIT](./LICENSE)
