<script setup lang="ts">
import type { EditorVariant } from '@hakulex/editor'
import type { SerializedEditorState } from 'lexical'
import { RichRenderer } from '@hakulex/renderer'
import { computed, ref, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CodeBox from '../../components/doc/CodeBox.vue'
import DocPage from '../../components/doc/DocPage.vue'
import SegmentedControl from '../../components/doc/SegmentedControl.vue'
import TabBar from '../../components/doc/TabBar.vue'
import { pollBackend } from '../../poll-backend'
import { playgroundDoc } from '../../site/playground'
import { findPreset } from '../../site/presets'
import { siteScheme } from '../../site/theme'
import SampleEditor from '../nodes/SampleEditor.vue'

/* One document, read or edited. The router only comes here for one that exists, and App.vue keys the page. */
const preset = findPreset(useRoute().params.id)!

const variants: { value: EditorVariant, label: string }[] = [
  { value: 'article', label: 'Article' },
  { value: 'note', label: 'Note' },
  { value: 'comment', label: 'Comment' },
]
const variant = ref<EditorVariant>('article')
const mode = ref<'read' | 'edit'>('read')
const modes = [
  { value: 'read', label: '呈現' },
  { value: 'edit', label: '編輯' },
] as const

const edited = shallowRef<SerializedEditorState>()
const value = computed(() => edited.value ?? preset.data)
function edit(state: SerializedEditorState | null | undefined) {
  if (state)
    edited.value = state
}
const json = computed(() => JSON.stringify(value.value, null, 2))

/* The editor page, with this document (as edited here) to work on. */
const router = useRouter()
function openInEditor() {
  playgroundDoc.value = structuredClone(value.value)
  void router.push('/editor')
}
</script>

<template>
  <DocPage
    :crumbs="[{ label: '試玩' }, { label: '範例文件', to: '/presets' }, { label: preset.label }]"
    :title="preset.label"
    :lead="preset.description"
  >
    <section class="doc-section">
      <h2 class="doc-h2">
        文件
      </h2>
      <div class="doc-bar">
        <TabBar v-model="mode" label="預覽模式" :tabs="modes" />
        <div class="preset-tools">
          <SegmentedControl v-model="variant" label="排版" :options="variants" />
          <button type="button" class="doc-button" @click="openInEditor">
            在編輯器開啟
          </button>
        </div>
      </div>
      <div class="doc-preview preset-body" role="tabpanel">
        <SampleEditor v-if="mode === 'edit'" :model-value="value" :variant="variant" @update:model-value="edit" />
        <RichRenderer v-else :value="value" :variant="variant" :color-scheme="siteScheme" :poll-adapter="pollBackend" />
      </div>
    </section>
    <section class="doc-section preset-json">
      <h2 class="doc-h2">
        序列化的 JSON
      </h2>
      <p class="doc-note">
        編輯分頁的修改會反映在這裡。
      </p>
      <CodeBox label="json" :value="json" />
    </section>
  </DocPage>
</template>

<style scoped>
.preset-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
</style>
