<script setup lang="ts">
import { createAgent, ensureBlockIds, scriptedModel } from '@hakulex/agent-core'
import { ref } from 'vue'
import { article } from './documents'

// 模型靠區塊的編號指出要改哪裡。編輯器裡由 @hakulex/plugin-block-id 負責，這裡直接替文件補上。
const document = ensureBlockIds(article)
const [, second] = document.root.children as unknown as { $: { blockId: string } }[]

// 這裡用照劇本回應的模型，不連到任何服務。實際使用時換成 claudeModel，或你自己寫的模型函式。
const model = scriptedModel([
  [
    {
      tool: 'replace_block',
      input: { blockId: second.$.blockId, xml: '<p>這篇已經<b>定稿</b>，今天就能發布。</p>' },
    },
    {
      tool: 'insert_blocks',
      input: { position: 'end', xml: '<p>最後補上一段結語。</p>' },
    },
  ],
  [
    { text: '我改了第二段，並在最後加了一段結語。' },
  ],
])

const agent = createAgent({
  model,
  getDocument: () => document,
})
const output = ref('')

function text(node: unknown): string {
  const { text: own, children = [] } = node as { text?: string, children?: unknown[] }
  return own ?? children.map(text).join('')
}

agent.send('把第二段改成已經定稿，最後加一段結語。').then(() => {
  // 模型提出的修改不會直接寫進文件，而是變成一項一項等你接受或拒絕。
  output.value = agent.items().map(item => [
    `${item.kind}（${item.state}）`,
    ...item.before.map(block => `- ${text(block)}`),
    ...item.after.map(block => `+ ${text(block)}`),
  ].join('\n')).join('\n\n')
})
</script>

<template>
  <pre>{{ output }}</pre>
</template>
