<script setup lang="ts">
import { computeDeltaStats, formatDeltaStats } from '@hakulex/diff-core'
import { article, revised } from './documents'

const stats = computeDeltaStats(article, revised)
</script>

<template>
  <pre>{{ formatDeltaStats(stats) }}</pre>
</template>
