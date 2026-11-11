<script setup lang="ts">
import type { ThemeTokens } from '@hakulex/style-token'
import { RichRenderer } from '@hakulex/renderer'
import { article } from './documents'

const theme: ThemeTokens = {
  color: {
    text: '#1d4ed8',
    bg: '#eff6ff',
  },
}
</script>

<template>
  <RichRenderer :value="article" :theme="theme" />
</template>
