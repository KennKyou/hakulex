<script setup lang="ts">
import { createDefaultRegistry, serializeToXml } from '@hakulex/litexml'
import { article } from './documents'

const xml = serializeToXml(article, createDefaultRegistry())
</script>

<template>
  <pre>{{ xml }}</pre>
</template>
