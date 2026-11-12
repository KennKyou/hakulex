# @hakulex/agent-core

讓 AI 模型修改 hakulex 文件的核心，不含畫面：模型怎麼看到文件、怎麼提出修改、修改怎麼變成可以逐項接受或拒絕的待審項目，以及把這些串起來的對話迴圈。

[hakulex](https://hakulex.dev) 的一部分：給 Vue 3 的富文本編輯器，建立在 Lexical 上。這個套件的說明和可以操作的範例在 [hakulex.dev/packages/agent-core](https://hakulex.dev/packages/agent-core)。

這個套件不依賴 Vue，也不需要編輯器，在瀏覽器和 Node 都能執行。

## 安裝

```bash
pnpm add @hakulex/agent-core lexical
```

## 先知道這幾件事

- **模型不會直接改文件。** 它提出的修改先進到一份「提議」，由人逐項接受或拒絕。
- **以最上層的區塊為單位。** 模型可以取代、刪除或新增整個區塊（段落、標題、清單、表格⋯⋯）。區塊要有編號：在編輯器裡用 [`@hakulex/plugin-block-id`](https://hakulex.dev/plugins/block-id)，沒有編輯器時用這裡的 `ensureBlockIds`。
- **整份文件會送給模型。** 每次送出訊息，文件會轉成 LiteXML 交給你接的模型服務。要不要這樣做、要不要告知使用者，由你的應用程式決定。
- **這個套件不經手金鑰。** 「模型」是你提供的一個函式，金鑰和網址都在那個函式裡。

## 使用

### 對話迴圈

`createAgent` 負責送出訊息、執行模型呼叫的工具、直到模型說完。下面用照劇本回應的模型，不需要任何服務就能執行：

```ts
import { createAgent, ensureBlockIds, scriptedModel } from '@hakulex/agent-core'
import { stored } from './documents' // 你自己的文件 JSON

let document = ensureBlockIds(stored)
const [first] = document.root.children as unknown as { $: { blockId: string } }[]

const agent = createAgent({
  getDocument: () => document,
  model: scriptedModel([
    [
      {
        tool: 'replace_block',
        input: { blockId: first.$.blockId, xml: '<p>改過的第一段</p>' }
      }
    ],
    [
      { text: '改好了。' }
    ],
  ]),
})

await agent.send('把第一段改短')

for (const item of agent.items())
  console.log(item.kind, item.state) // replace pending

// 接受：agent 不會自己寫文件，它把新的文件交給你，由你放回文件所在的地方。
const result = agent.accept(agent.items()[0].id)
if (result.ok)
  document = result.document
```

| 方法 | 說明 |
| --- | --- |
| `send(text, { selection })` | 送出使用者的話，執行到模型說完。`selection` 可以是 `{ blockIds }` 或 `{ blockId, text }`。 |
| `stop()` | 中止進行中的這一輪。已經暫存的修改會保留。 |
| `retry()` | 狀態是錯誤時，重新送出上一則訊息。 |
| `items()` | 目前的待審項目。 |
| `accept(itemId, { overwrite })`、`acceptAll()` | 回傳 `{ ok, document, reason }`。`acceptAll` 不會套用衝突的項目。 |
| `reject(itemId)`、`rejectAll()` | 拒絕。下一次送出訊息時會告訴模型。 |
| `getState()`、`subscribe(listener)` | 狀態（`idle`、`running`、`error`）、訊息列表和提議。 |
| `snapshot()` | 目前的對話和提議，是可以轉成 JSON 的純資料；傳給 `createAgent({ snapshot })` 就能接著用。 |

`createAgent` 的其他選項：`instructions`（加在內建的系統提示後面，例如語氣和語言）、`maxRounds`（一輪對話最多詢問模型幾次，預設 8）、`maxDocumentChars`（文件轉成 LiteXML 後超過這個長度就不送出）、`registry`（自訂的 LiteXML registry）。

對話只存在記憶體裡。要保留就把 `snapshot()` 存到你選的地方。

### 待審項目的狀態

| 狀態 | 意思 |
| --- | --- |
| `pending` | 待審。 |
| `accepted` | 已接受。在編輯器裡復原之後，它會自己回到 `pending`。 |
| `conflict` | 模型提議之後，使用者改了同一個區塊。不會自動合併：拒絕它，或用 `accept(id, { overwrite: true })` 採用模型的版本。 |

接受了一個修改、之後使用者又改了那個區塊，這一項就算結束，不會再列出。

### 接上 Claude

`claudeModel` 把請求組成 Claude Messages API 的格式，並讀取串流的回應。實際送出請求的 `send` 由你提供，通常是打到你自己的後端，由後端加上金鑰再轉送，並把串流原樣傳回：

```ts
import { claudeModel, createAgent } from '@hakulex/agent-core'

const model = claudeModel({
  model: 'claude-opus-5-5',
  send: (body, signal) => fetch('/api/claude', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  }),
})

const agent = createAgent({
  model,
  getDocument: () => document
})
```

不要把 API 金鑰放進會送到瀏覽器的程式裡。

其他選項：`maxTokens`（預設 64000）和 `body`（加進請求的其他欄位）。例如要顯示模型的思考摘要：

```ts
claudeModel({
  model: 'claude-opus-5-5',
  send,
  body: {
    thinking: { type: 'adaptive', display: 'summarized' }
  }
})
```

這個轉接是照 Claude 的官方文件寫的，自動測試用的是照文件準備的回應，不是實際的服務。

### 接上別的模型

模型就是一個函式：收到系統提示、訊息、工具定義和中止訊號，回傳一串片段。

```ts
import type { Model } from '@hakulex/agent-core'

const model: Model = async function* ({ system, messages, tools, signal }) {
  // 呼叫你的服務，把回應轉成片段：
  yield { type: 'text', text: '我來改。' }
  yield {
    type: 'tool_call',
    id: 'call_1',
    name: 'delete_block',
    input: '{"blockId":"…"}'
  }
  yield { type: 'done' }
}
```

片段的種類：`text`、`thinking`、`tool_call_start`、`tool_call_partial`（到目前為止的完整參數）、`tool_call`（完成的工具呼叫，`input` 是 JSON 文字）、`state`（服務自己要原樣拿回去的資料）、`done`。

### 只用純函式

不想用對話迴圈時，底下的函式都可以單獨使用。它們只處理 JSON，不會改動傳入的物件。

```ts
import {
  acceptAll,
  agentTools,
  applyToolCall,
  createProposal,
  documentToXml,
  ensureBlockIds,
  reviewItems,
} from '@hakulex/agent-core'
import { stored } from './documents'

const document = ensureBlockIds(stored)
let proposal = createProposal()

const xml = documentToXml(document, { proposal }) // 給模型看的 LiteXML
// 把 xml 和 agentTools（三個工具的定義）交給你的模型，再把它的工具呼叫交回來：
const result = applyToolCall(document, proposal, {
  name: 'insert_blocks',
  input: { position: 'end', xml: '<p>新的一段</p>' },
})
if (result.ok)
  proposal = result.proposal
// result.content 是要回給模型的文字，失敗時說明哪裡錯了。

const items = reviewItems(document, proposal)
const accepted = acceptAll(document, proposal) // { ok, document, proposal }
```

| 函式 | 說明 |
| --- | --- |
| `ensureBlockIds(document)` | 替最上層的區塊補上編號。 |
| `documentToXml(document, { proposal, selection, registry })` | 文件的 LiteXML；帶 `proposal` 時是套用待審修改之後的樣子。 |
| `agentTools` | `insert_blocks`、`replace_block`、`delete_block` 的定義，`parameters` 是 JSON Schema。 |
| `applyToolCall(document, proposal, call, { turn, seen, registry })` | 執行一次工具呼叫。失敗時提議不變。 |
| `createProposal()` | 空的提議。 |
| `reviewItems(document, proposal)` | 待審項目。 |
| `acceptItem(document, proposal, itemId, { overwrite })`、`acceptAll(document, proposal)` | 回傳新的文件和新的提議。 |
| `rejectItem(proposal, itemId)`、`rejectAll(proposal)` | 回傳新的提議。 |
| `takeRejected(proposal)` | 取出還沒告訴模型的拒絕紀錄。 |
| `settleProposal(document, proposal)` | 拿掉已經接受或結束的紀錄。 |

提議是純資料，帶有版本號（`version: 1`），可以存成 JSON 之後再接著用。

LiteXML 不認得的區塊類型，模型只會看到「這裡有一個區塊」，看不到內容，也不能改寫，只能刪除或在旁邊新增。

## 授權

[MIT](./LICENSE)
