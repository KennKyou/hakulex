<script setup lang="ts">
import { RichRenderer } from '@hakulex/renderer'
import { article } from './documents'
</script>

<template>
  <RichRenderer :value="article" variant="article" />
</template>
