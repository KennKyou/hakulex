<script setup lang="ts">
import DocPage from '../../components/doc/DocPage.vue'
import TileGrid from '../../components/doc/TileGrid.vue'
import { chartKinds, chartSamples, chartSamplesOf } from '../../site/charts'

/* Every kind of chart. */
const tiles = chartKinds.map(kind => ({
  to: `/charts/${kind.key}`,
  title: kind.label,
  note: `${chartSamplesOf(kind.key).length} 個範例`,
}))
</script>

<template>
  <DocPage
    :crumbs="[{ label: '參考' }, { label: '圖表' }]"
    title="圖表"
    :lead="`${chartSamples.length} 個範例，都是由 JSON 規格畫出的 SVG，把滑鼠移到圖上可以看數值。`"
    wide
    :toc="false"
  >
    <TileGrid :tiles="tiles" tile-class="chart-tile" min="200px" />
  </DocPage>
</template>
