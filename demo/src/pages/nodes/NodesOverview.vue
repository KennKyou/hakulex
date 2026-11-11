<script setup lang="ts">
import type { NodeCategory } from '../../site/nodes'
import { computed, ref } from 'vue'
import DocPage from '../../components/doc/DocPage.vue'
import SegmentedControl from '../../components/doc/SegmentedControl.vue'
import TileGrid from '../../components/doc/TileGrid.vue'
import { nodeCategories, nodesIn, nodeTypes } from '../../site/nodes'

/* Every node, by group. */
type Filter = 'all' | NodeCategory

const filter = ref<Filter>('all')
const filters = [
  { value: 'all' as Filter, label: '全部', count: nodeTypes.length },
  ...nodeCategories.map(({ key, label }) => ({ value: key as Filter, label, count: nodesIn(key).length })),
]
const groups = computed(() => nodeCategories
  .filter(({ key }) => filter.value === 'all' || filter.value === key)
  .map(({ key, label }) => ({
    key,
    label,
    count: nodesIn(key).length,
    tiles: nodesIn(key).map(node => ({
      to: `/nodes/${node.type}`,
      title: node.label,
      code: node.type,
      note: `${node.samples.length} 個範例`,
    })),
  })))
const sampleCount = nodeTypes.reduce((sum, node) => sum + node.samples.length, 0)
</script>

<template>
  <DocPage
    :crumbs="[{ label: '參考' }, { label: '節點' }]"
    title="節點"
    :lead="`${nodeTypes.length} 種節點、${sampleCount} 個範例。每張卡片都能進入該節點的頁面，看呈現結果、切到編輯和查看 JSON。`"
    wide
    :toc="false"
  >
    <SegmentedControl v-model="filter" label="分組" :options="filters" />
    <section v-for="group in groups" :key="group.key" class="node-group">
      <header class="node-group-head">
        <h2 class="doc-h2">
          {{ group.label }}
        </h2>
        <span class="node-group-count">{{ group.count }}</span>
      </header>
      <TileGrid :tiles="group.tiles" tile-class="node-tile" min="200px" />
    </section>
  </DocPage>
</template>

<style scoped>
.node-group {
  margin-top: 32px;
}

.node-group-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 12px;
}

.node-group-count {
  color: var(--hlx-color-text-tertiary);
  font-size: 13px;
}
</style>
