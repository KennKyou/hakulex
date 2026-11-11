<script setup lang="ts">
import type { ChartIssue } from '../chart/spec'

defineProps<{ issues: ChartIssue[] }>()
</script>

<template>
  <div class="hlx-chart-error">
    <p class="hlx-chart-error-title">
      無法顯示圖表
    </p>
    <ul>
      <li v-for="(issue, index) in issues" :key="index">
        <code>{{ issue.path }}</code> {{ issue.message }}
        <span v-if="issue.hint" class="hlx-chart-error-hint">{{ issue.hint }}</span>
      </li>
    </ul>
  </div>
</template>
