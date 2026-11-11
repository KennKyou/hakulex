<script setup lang="ts">
import type { ChartHover } from '../chart/hover'

defineProps<{ hover: ChartHover, width: number }>()
</script>

<template>
  <div
    class="hlx-chart-tooltip"
    :data-side="hover.side"
    :style="{ left: `${hover.x / width * 100}%` }"
    aria-hidden="true"
  >
    <div class="hlx-chart-tooltip-title">
      {{ hover.title }}
    </div>
    <div v-for="(row, index) in hover.rows" :key="index" class="hlx-chart-tooltip-row" :data-muted="row.muted || undefined">
      <span class="hlx-chart-swatch" :class="`hlx-chart-c${row.color}`" />
      <span class="hlx-chart-tooltip-label">{{ row.label }}</span>
      <span class="hlx-chart-tooltip-value">{{ row.value }}<template v-if="row.percent !== undefined"> · {{ row.percent }}%</template></span>
    </div>
    <div v-if="hover.total" class="hlx-chart-tooltip-row hlx-chart-tooltip-total">
      <span class="hlx-chart-tooltip-label">總計</span>
      <span class="hlx-chart-tooltip-value">{{ hover.total }}</span>
    </div>
  </div>
</template>
