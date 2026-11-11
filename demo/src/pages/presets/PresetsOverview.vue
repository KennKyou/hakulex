<script setup lang="ts">
import DocPage from '../../components/doc/DocPage.vue'
import TileGrid from '../../components/doc/TileGrid.vue'
import { presets } from '../../site/presets'

/* Every sample document. */
const tiles = presets.map(preset => ({
  to: `/presets/${preset.id}`,
  title: preset.label,
  note: preset.description,
}))
</script>

<template>
  <DocPage
    :crumbs="[{ label: '試玩' }, { label: '範例文件' }]"
    title="範例文件"
    lead="接近真實內容的文件，可以看呈現結果、切到編輯和查看 JSON。"
    wide
    :toc="false"
  >
    <TileGrid :tiles="tiles" tile-class="preset-tile" min="260px" />
  </DocPage>
</template>
