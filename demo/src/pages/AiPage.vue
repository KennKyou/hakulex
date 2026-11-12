<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { AgentChat } from '@hakulex/agent-chat'
import { RichEditor, validateUrl } from '@hakulex/editor'
import { AgentPlugin, useAgent } from '@hakulex/plugin-agent'
import { BlockHandlePlugin } from '@hakulex/plugin-block-handle'
import { FloatingToolbarPlugin } from '@hakulex/plugin-floating-toolbar'
import { LinkEditPlugin } from '@hakulex/plugin-link-edit'
import { LiteXmlPastePlugin } from '@hakulex/plugin-litexml-paste'
import { MentionMenuPlugin } from '@hakulex/plugin-mention'
import { SlashMenuPlugin } from '@hakulex/plugin-slash-menu'
import { TablePlugin } from '@hakulex/plugin-table'
import { ToolbarPlugin } from '@hakulex/plugin-toolbar'
import { ref, shallowRef } from 'vue'
import WorkbenchLayout from '../components/workbench/WorkbenchLayout.vue'
import { announcement } from '../site/ai/document'
import { demoModel, suggestions } from '../site/ai/scripts'
import { usePageMeta } from '../site/seo'
import { siteScheme } from '../site/theme'

/*
 * The whole of the AI side in one place: the editor with every plugin, the review inside it and
 * the chat beside it. The model answers from a script; nothing here is sent anywhere.
 */
usePageMeta(['AI 協作'], '和 AI 一起改一篇文章的完整示範：在聊天面板提出要求，AI 提議的修改顯示在編輯器裡，逐項接受或拒絕。這裡的 AI 照劇本回應，沒有連到任何服務。')

const doc = shallowRef<SerializedEditorState | null>(announcement())
const agent = shallowRef(useAgent({
  model: demoModel(),
}))
/** Counts the times the page was started over: the editor and the chat are made anew with it. */
const round = ref(0)
function startOver() {
  agent.value.stop()
  doc.value = announcement()
  agent.value = useAgent({
    model: demoModel(),
  })
  round.value++
}
</script>

<template>
  <WorkbenchLayout title="AI 協作" class="ai-wb">
    <template #meta>
      <span class="ai-note">示範：這裡的 AI 照劇本回應，沒有連到任何服務</span>
      <button type="button" class="doc-button ai-restart" @click="startOver">
        重新開始
      </button>
    </template>

    <main class="hlx-root ai-page" data-variant="article" :data-color-scheme="siteScheme">
      <div class="ai-frame">
        <RichEditor
          :key="round"
          v-model="doc"
          variant="article"
          :color-scheme="siteScheme"
          placeholder="輸入 / 插入區塊"
        >
          <template #toolbar>
            <ToolbarPlugin :validate-url="validateUrl" />
          </template>
          <FloatingToolbarPlugin :validate-url="validateUrl" />
          <LinkEditPlugin :validate-url="validateUrl" />
          <SlashMenuPlugin />
          <MentionMenuPlugin />
          <LiteXmlPastePlugin />
          <template #nested>
            <FloatingToolbarPlugin :validate-url="validateUrl" />
            <LinkEditPlugin :validate-url="validateUrl" />
            <SlashMenuPlugin />
            <MentionMenuPlugin />
            <LiteXmlPastePlugin />
          </template>
          <TablePlugin />
          <BlockHandlePlugin />
          <AgentPlugin :agent="agent" />
        </RichEditor>
      </div>
    </main>

    <template #panel>
      <div class="ai-chat">
        <AgentChat
          :key="round"
          :agent="agent"
          :suggestions="suggestions"
          :color-scheme="siteScheme"
          placeholder="請 AI 修改這篇文章"
        />
      </div>
    </template>
  </WorkbenchLayout>
</template>

<style scoped>
/* A chat needs a little more room than a list of settings. */
.ai-wb {
  --wb-panel-width: 360px;
}

.ai-note {
  color: var(--hlx-color-text-tertiary);
  font-size: 13px;
}

.ai-restart {
  margin-left: auto;
}

.ai-page {
  box-sizing: border-box;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: 8px 16px 48px;
  background: var(--hlx-color-bg);
  color: var(--hlx-color-text);
}

.ai-frame {
  display: flex;
  flex-direction: column;
  min-height: 240px;
  /* Room on the left for the block handle. */
  padding: 16px 20px 16px 60px;
}

.ai-frame > :deep(.hlx-editor) {
  flex: 1;
  min-width: 0;
}

/* Under the bar on top. */
.ai-frame :deep(.hlx-fixed-toolbar) {
  position: sticky;
  top: 44px;
  background: var(--hlx-color-bg);
}

.ai-chat {
  height: 100%;
}

@media (max-width: 1023px) {
  .ai-chat {
    height: 480px;
  }
}
</style>
