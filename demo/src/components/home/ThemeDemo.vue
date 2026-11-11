<script setup lang="ts">
import { RichRenderer } from '@hakulex/renderer'
import { computed, ref } from 'vue'
import { pollBackend } from '../../poll-backend'
import { accentColor, accentTheme } from '../../site/accents'
import { accentDocument } from '../../site/home'
import { siteScheme } from '../../site/theme'
import AccentSwatches from '../doc/AccentSwatches.vue'

const accent = ref('')
const theme = computed(() => accentTheme(accentColor(accent.value, siteScheme.value)))
</script>

<template>
  <div class="theme-demo">
    <AccentSwatches v-model="accent" class="theme-swatches" :scheme="siteScheme" />
    <RichRenderer :value="accentDocument" :theme="theme" :color-scheme="siteScheme" :poll-adapter="pollBackend" />
  </div>
</template>

<style scoped>
.theme-swatches {
  margin-bottom: 12px;
}

/* The last block's own space below would only make the box scroll. */
.theme-demo :deep(.hlx-renderer > :last-child) {
  margin-bottom: 0;
}
</style>
