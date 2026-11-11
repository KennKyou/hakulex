<script setup lang="ts">
import { RichDiff } from '@hakulex/diff'
import { article, revised } from '../../site/examples/documents'
import { siteScheme } from '../../site/theme'
</script>

<template>
  <RichDiff :old-value="article" :new-value="revised" layout="inline" :color-scheme="siteScheme" />
</template>
