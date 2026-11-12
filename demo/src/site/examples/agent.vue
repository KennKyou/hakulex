<script setup lang="ts">
import type { ModelRequest } from '@hakulex/agent-core'
import type { SerializedEditorState } from 'lexical'
import { scriptedModel } from '@hakulex/agent-core'
import { RichEditor } from '@hakulex/editor'
import { AgentPlugin, useAgent } from '@hakulex/plugin-agent'
import { shallowRef } from 'vue'
import { article } from './documents'

const doc = shallowRef<SerializedEditorState | null>(article)

// 這個展示用照劇本回應的模型。實際使用時換成 claudeModel 或你自己的模型函式，其餘不變。
// 真的模型會自己從文件裡讀出區塊的編號；劇本沒辦法，所以這裡從送出的文件裡找。
function blockIds(request: ModelRequest) {
  const last = request.messages.at(-1)
  return [
    ...(last?.role === 'user'
      ? last.text
      : '').matchAll(/<\w+ id="([^"]+)"/g),
  ].map(match => match[1])
}
function script() {
  return scriptedModel([
    [
      {
        tool: 'insert_blocks',
        input: { position: 'start', xml: '<p>AI 加在開頭的一段。</p>' },
      },
      {
        tool: 'replace_block',
        input: (request: ModelRequest) => ({ blockId: blockIds(request)[1], xml: '<p>這篇已經<b>定稿</b>，今天就能發布。</p>' }),
      },
      {
        tool: 'delete_block',
        input: (request: ModelRequest) => ({ blockId: blockIds(request)[2] }),
      },
      {
        tool: 'insert_blocks',
        input: { position: 'end', xml: '<p>AI 加在結尾的一段。</p>' },
      },
    ],
    [
      { text: '我提了四項修改。' },
    ],
  ])
}

let play = script()
const agent = useAgent({
  model: request => play(request),
})

function ask() {
  // 每次都從劇本的開頭播放。
  play = script()
  agent.rejectAll()
  agent.send('幫我把這篇改成可以發布的樣子。')
}
</script>

<template>
  <RichEditor v-model="doc">
    <template #toolbar>
      <button type="button" class="ask" :disabled="!agent.ready.value || agent.state.value.status === 'running'" @click="ask">
        讓 AI 修改
      </button>
    </template>
    <AgentPlugin :agent="agent" />
  </RichEditor>
</template>

<style scoped>
.ask {
  margin-bottom: 12px;
  padding: 4px 12px;
  border: 1px solid var(--hlx-color-border);
  border-radius: 6px;
  background: var(--hlx-color-bg);
  color: var(--hlx-color-text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.ask:disabled {
  color: var(--hlx-color-text-quaternary);
  cursor: default;
}
</style>
