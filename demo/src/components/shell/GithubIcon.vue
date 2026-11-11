<script setup lang="ts">
import { MENTION_PLATFORMS } from '@hakulex/renderer'

/* GitHub's mark (Simple Icons, CC0), the one GitHub mentions use, in the text's color. */
withDefaults(defineProps<{ size?: number }>(), { size: 16 })
const path = MENTION_PLATFORMS.GH.icon
</script>

<template>
  <svg class="github-icon" viewBox="0 0 24 24" :width="size" :height="size" fill="currentColor" aria-hidden="true"><path :d="path" /></svg>
</template>
