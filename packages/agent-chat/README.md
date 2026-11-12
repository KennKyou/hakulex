# @hakulex/agent-chat

和 AI 討論編輯器裡那份文件的聊天面板：顯示對話、AI 正在做的事，以及一個輸入框。AI 提議的修改顯示在編輯器裡，由 [`@hakulex/plugin-agent`](https://hakulex.dev/plugins/agent) 負責。

[hakulex](https://hakulex.dev) 的一部分：給 Vue 3 的富文本編輯器，建立在 Lexical 上。這個套件的說明和可以操作的範例在 [hakulex.dev/packages/agent-chat](https://hakulex.dev/packages/agent-chat)。

## 安裝

```bash
pnpm add @hakulex/agent-chat @hakulex/plugin-agent @hakulex/agent-core @hakulex/editor lexical vue
```

在你的進入點引入樣式，放在 `@hakulex/editor/style.css` 之後：

```ts
import '@hakulex/plugin-agent/style.css'
import '@hakulex/agent-chat/style.css'
```

## 使用

```vue
<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { AgentChat } from '@hakulex/agent-chat'
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
  <div class="layout">
    <RichEditor v-model="doc">
      <AgentPlugin :agent="agent" />
    </RichEditor>
    <aside class="chat">
      <AgentChat :agent="agent" :suggestions="['把這篇改得精簡一點']" />
    </aside>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
}

/* 面板會填滿放它的容器，所以容器要有高度。 */
.chat {
  height: 480px;
}
</style>
```

編輯器和面板用的是同一個 `agent`。模型的選擇、`claudeModel` 的說明，以及不連任何服務就能試用的 `scriptedModel`，見 [`@hakulex/agent-core`](https://hakulex.dev/packages/agent-core)。整份文件會送給你接的模型服務。

## 它做什麼

- **對話**：使用者的話和 AI 的回覆。回覆在生成的時候逐段出現，結束前可以中止。
- **回覆的格式**：粗體、清單、程式碼這些 Markdown 寫法會呈現出來。回覆裡的 HTML 只當成文字顯示，圖片不會載入，只留下替代文字。
- **思考過程**：模型有提供的話，收在一行裡，按了才展開。
- **AI 做了什麼**：每一項修改用一句話說明，例如「修改了一個區塊」，並標示正在進行、完成或失敗。
- **選取**：在編輯器裡選取的文字或區塊會顯示在輸入框上方，並跟著下一則訊息送出；可以先移除。
- **輸入**：Enter 送出，Shift+Enter 換行。輸入法選字用的 Enter 不會送出。
- **捲動**：停在最底下時跟著最新的內容；往上捲之後不會被拉回去，並出現「跳到最新」的按鈕。
- **錯誤**：顯示原因和「重試」。
- 接受和拒絕修改不在這裡，在編輯器裡。

## `<AgentChat>`

| Prop | 型別 | 說明 |
| --- | --- | --- |
| `agent` | `AgentController` | 用 `useAgent` 建立的 agent，和 `<AgentPlugin>` 拿的是同一個。 |
| `placeholder` | `string` | 輸入框空白時的提示，預設「輸入訊息」。 |
| `suggestions` | `string[]` | 對話還是空的時候顯示的幾句問法，按了就送出。 |
| `colorScheme` | `'light' \| 'dark'` | 淺色或深色，預設 `'light'`。面板在編輯器外面，要和編輯器各自設定。 |

面板的寬度和高度都跟著放它的容器；只有訊息列表會捲動，輸入框固定在底部。它最窄可以放進 280 像素寬的容器。

## 限制

- 連結可以點。模型寫出的網址沒有經過檢查，和任何由模型產生的內容一樣。
- 深淺色只有 `colorScheme` 這兩種；顏色來自編輯器的 CSS 變數，想調整的話在外層覆寫 `--hlx-*` 變數。
- 介面文字是繁體中文，目前不能替換。
- 對話只在記憶體裡，重新整理頁面就沒有了，除非你保存 `agent.snapshot()`。

## 授權

[MIT](./LICENSE)
