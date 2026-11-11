<script setup lang="ts">
import type { EditorVariant } from '@hakulex/editor'
import type { SerializedEditorState } from 'lexical'
import { RichRenderer } from '@hakulex/renderer'
import { computed, ref, shallowRef } from 'vue'
import { useRoute } from 'vue-router'
import CodeBox from '../../components/doc/CodeBox.vue'
import DocPage from '../../components/doc/DocPage.vue'
import SegmentedControl from '../../components/doc/SegmentedControl.vue'
import TabBar from '../../components/doc/TabBar.vue'
import { pollBackend } from '../../poll-backend'
import { openLightbox } from '../../site/lightbox'
import { findNode, neighbours, nodeCategories } from '../../site/nodes'
import { siteScheme } from '../../site/theme'
import SampleEditor from './SampleEditor.vue'

/*
 * One node: its samples, read or edited, and their JSON. The router only comes here for a node
 * that exists, and App.vue keys the page by node, so each one starts over.
 */
const node = findNode(useRoute().params.type)!
const categoryLabel = nodeCategories.find(({ key }) => key === node.category)!.label
const { previous, next } = neighbours(node.type)
const toLink = (other: typeof previous) => other && { label: other.label, to: `/nodes/${other.type}` }

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

const edited = shallowRef<Record<string, SerializedEditorState>>({})
const valueOf = (sample: { key: string, data: SerializedEditorState }) => edited.value[sample.key] ?? sample.data
function edit(key: string, state: SerializedEditorState | null | undefined) {
  if (state)
    edited.value = { ...edited.value, [key]: state }
}

const jsonKey = ref(node.samples[0].key)
const jsonOptions = node.samples.map(sample => ({ value: sample.key, label: sample.label }))
const json = computed(() => JSON.stringify(valueOf(node.samples.find(({ key }) => key === jsonKey.value)!), null, 2))
</script>

<template>
  <DocPage
    :crumbs="[{ label: '參考' }, { label: '節點', to: '/nodes' }, { label: categoryLabel }]"
    :title="node.label"
    :lead="node.description"
    :previous="toLink(previous)"
    :next="toLink(next)"
  >
    <template #meta>
      <div class="doc-meta node-meta">
        <code class="doc-chip">{{ node.type }}</code>
        <span class="doc-chip">{{ node.packageName }}</span>
      </div>
    </template>

    <section class="doc-section">
      <h2 class="doc-h2">
        預覽
      </h2>
      <div class="doc-bar">
        <TabBar v-model="mode" label="預覽模式" :tabs="modes" />
        <SegmentedControl v-model="variant" label="排版" :options="variants" />
      </div>
      <div class="doc-preview" role="tabpanel">
        <section v-for="sample in node.samples" :key="sample.key" class="node-sample doc-divided">
          <h3 v-if="node.samples.length > 1" class="doc-caption">
            {{ sample.label }}
          </h3>
          <SampleEditor
            v-if="mode === 'edit'"
            :model-value="valueOf(sample)"
            :variant="variant"
            @update:model-value="edit(sample.key, $event)"
          />
          <RichRenderer
            v-else
            :value="valueOf(sample)"
            :variant="variant"
            :color-scheme="siteScheme"
            :poll-adapter="pollBackend"
            @image-click="openLightbox"
          />
        </section>
      </div>
    </section>

    <section class="doc-section node-json">
      <h2 class="doc-h2">
        序列化的 JSON
      </h2>
      <p class="doc-note">
        編輯分頁的修改會反映在這裡。
      </p>
      <div v-if="node.samples.length > 1" class="node-json-picker">
        <SegmentedControl v-model="jsonKey" label="JSON 範例" :options="jsonOptions" />
      </div>
      <CodeBox label="json" :value="json" />
    </section>
  </DocPage>
</template>

<style scoped>
.node-meta {
  margin-top: 0;
}

.node-json-picker {
  margin-bottom: 12px;
}
</style>
