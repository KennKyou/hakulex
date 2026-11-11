<script setup lang="ts">
import { RichDiff } from '@hakulex/diff'
import { article, revised } from './documents'
</script>

<template>
  <RichDiff :old-value="article" :new-value="revised" layout="inline" />
</template>
