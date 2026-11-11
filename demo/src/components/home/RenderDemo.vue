<script setup lang="ts">
import { RichRenderer } from '@hakulex/renderer'
import { article } from '../../site/examples/documents'
import { siteScheme } from '../../site/theme'
</script>

<template>
  <RichRenderer :value="article" :color-scheme="siteScheme" />
</template>
