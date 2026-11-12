<script setup lang="ts">
import type { Model, ModelRequest, ScriptStep } from '@hakulex/agent-core'
import type { SerializedEditorState } from 'lexical'
import { AgentChat } from '@hakulex/agent-chat'
import { scriptedModel } from '@hakulex/agent-core'
import { RichEditor } from '@hakulex/editor'
import { AgentPlugin, useAgent } from '@hakulex/plugin-agent'
import { shallowRef } from 'vue'
import { article } from './documents'

// 面板在編輯器外面，深淺色要各自設定；兩邊給同一個值。
defineProps<{ colorScheme?: 'light' | 'dark' }>()

const doc = shallowRef<SerializedEditorState | null>(article)

const shorter = '把這篇改得精簡一點'
const checklist = '在結尾加一份檢查清單'
const about = '這篇在講什麼？'
const suggestions = [shorter, checklist, about]

// 這個展示用照劇本回應的模型，沒有連到任何服務。實際使用時把 model 換成 claudeModel
// 或你自己的模型函式，其餘不變。真的模型會自己從文件裡讀出區塊的編號；劇本要自己找。
function blockId(request: ModelRequest, tag: string) {
  const last = request.messages.at(-1)
  const text = last?.role === 'user'
    ? last.text
    : ''
  return new RegExp(`<${tag} id="([^"]+)"`).exec(text)?.[1]
}

function scriptFor(request: ModelRequest, words: string): ScriptStep[][] {
  if (words.endsWith(shorter)) {
    const paragraph = blockId(request, 'p')
    const quote = blockId(request, 'blockquote')
    const edits: ScriptStep[] = []
    if (paragraph) {
      edits.push({
        tool: 'replace_block',
        input: { blockId: paragraph, xml: '<p>這篇是<b>草稿</b>，週五前改完。</p>' },
      })
    }
    if (quote) {
      edits.push({
        tool: 'delete_block',
        input: { blockId: quote },
      })
    }
    if (edits.length === 0) {
      return [
        [
          { text: '這篇已經很精簡了，我沒有要改的地方。' },
        ],
      ]
    }
    return [
      [
        { thinking: '這篇有一個標題、一段說明和一句引言。說明可以更短；引言和主題的關係不大。' },
        { text: '我看過整篇了。說明那一段可以再短一點，引言和主題的關係不大，我建議拿掉。' },
        ...edits,
      ],
      [
        { text: `我提了 ${edits.length} 項修改：**縮短說明**，並拿掉引言。請在編輯器裡逐項接受或拒絕。` },
      ],
    ]
  }
  if (words.endsWith(checklist)) {
    return [
      [
        { text: '好，我在結尾加一份清單。' },
        {
          tool: 'insert_blocks',
          input: {
            position: 'end',
            xml: '<h2>檢查清單</h2><ul><li><p>標題和內文沒有錯字</p></li><li><p>連結都能打開</p></li><li><p>圖片有替代文字</p></li></ul>',
          },
        },
      ],
      [
        { text: '我在結尾加了一個小標題和三項清單，內容可以在接受之後再改。' },
      ],
    ]
  }
  if (words.endsWith(about)) {
    return [
      [
        { text: '這是一篇發布前的備忘：\n\n- 文章目前還是**草稿**\n- 要在週五前改完\n\n這個問題不需要修改文件，所以我沒有提出任何修改。' },
      ],
    ]
  }
  return [
    [
      { text: `這是示範：這裡的 AI 照寫好的劇本回應，沒有連到任何服務，只認得這幾句：「${shorter}」、「${checklist}」和「${about}」。` },
    ],
  ]
}

let play: Model | undefined
const agent = useAgent({
  model: (request) => {
    const last = request.messages.at(-1)
    // 新的一句話從新的劇本開始；同一輪裡後續的請求接著播。
    if (last?.role === 'user' || !play) {
      play = scriptedModel(scriptFor(request, last?.role === 'user'
        ? last.text
        : ''), { delay: 30, chunkSize: 3 })
    }
    return play(request)
  },
})
</script>

<template>
  <div class="with-chat">
    <RichEditor v-model="doc" :color-scheme="colorScheme" class="with-chat-editor">
      <AgentPlugin :agent="agent" />
    </RichEditor>
    <!-- 面板會填滿放它的容器：寬度和高度由這個容器決定。 -->
    <aside class="with-chat-panel">
      <AgentChat :agent="agent" :suggestions="suggestions" :color-scheme="colorScheme" />
    </aside>
  </div>
</template>

<style scoped>
.with-chat {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  align-items: start;
}

.with-chat-editor {
  min-width: 0;
  padding-right: 16px;
}

.with-chat-panel {
  height: 460px;
  border-left: 1px solid var(--hlx-color-border);
}

@media (max-width: 860px) {
  .with-chat {
    grid-template-columns: minmax(0, 1fr);
  }

  .with-chat-panel {
    width: 320px;
    max-width: 100%;
    height: 420px;
    border-top: 1px solid var(--hlx-color-border);
    border-left: 0;
  }
}
</style>
