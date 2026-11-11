<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import type { ChartKind, ChartSample } from '../../site/charts'
import { RichRenderer } from '@hakulex/renderer'
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import DocPage from '../../components/doc/DocPage.vue'
import { chartSamplesOf, chartSource, findChartKind } from '../../site/charts'
import { siteScheme } from '../../site/theme'

/* One kind of chart. The router only comes here for a kind that exists. */
const kind = findChartKind(useRoute().params.id)!
const samples = chartSamplesOf(kind.key as ChartKind)

function chartDoc(sample: ChartSample) {
  return {
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children: [
        {
          type: 'chart',
          version: 1,
          spec: chartSource(sample.spec),
        },
      ],
    },
  } as unknown as SerializedEditorState
}

const open = ref<Record<string, boolean>>({})
const litexml = (sample: ChartSample) => `<chart><![CDATA[\n${chartSource(sample.spec)}\n]]></chart>`
</script>

<template>
  <DocPage
    :crumbs="[{ label: '參考' }, { label: '圖表', to: '/charts' }, { label: kind.label }]"
    :title="kind.label"
    :lead="`${samples.length} 個範例，都是由 JSON 規格畫出的 SVG。`"
  >
    <template #meta>
      <span class="doc-chip">@hakulex/renderer</span>
    </template>
    <section v-for="sample in samples" :key="sample.key" class="doc-section chart-sample">
      <header>
        <div>
          <h2 class="doc-h2">
            {{ sample.label }}
          </h2>
          <p class="doc-note">
            {{ sample.description }}
          </p>
        </div>
        <button type="button" class="doc-button" :aria-expanded="!!open[sample.key]" @click="open[sample.key] = !open[sample.key]">
          LiteXML
        </button>
      </header>
      <pre v-if="open[sample.key]" class="chart-source" tabindex="0">{{ litexml(sample) }}</pre>
      <div class="doc-preview chart-body" :class="sample.frame && `chart-body-${sample.frame}`">
        <div v-if="sample.frame === 'dark'" class="hlx-root chart-dark" data-color-scheme="dark">
          <RichRenderer :value="chartDoc(sample)" color-scheme="dark" />
        </div>
        <RichRenderer v-else :value="chartDoc(sample)" :color-scheme="siteScheme" />
      </div>
    </section>
  </DocPage>
</template>

<style scoped>
.chart-sample header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.chart-sample .doc-note {
  margin-bottom: 0;
}

.chart-body {
  margin-top: 12px;
}

.chart-source {
  max-height: 280px;
  margin: 12px 0 0;
  padding: 14px;
  overflow: auto;
  border: 1px solid var(--hlx-color-border);
  border-radius: 10px;
  color: var(--hlx-color-text);
  font-family: var(--hlx-font-mono);
  font-size: 12.5px;
}

.chart-body-narrow {
  box-sizing: border-box;
  max-width: 360px;
}

.chart-dark {
  padding: 16px;
  border-radius: 8px;
  background: var(--hlx-color-bg);
}
</style>
