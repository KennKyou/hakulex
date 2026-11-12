<script setup lang="ts">
import type { AgentController } from './agent'
import { AgentBinding } from './agent'
import ReviewLayer from './review/ReviewLayer.vue'

/*
 * Joins an agent to the editor it is placed in, and shows what the agent proposes beside the
 * blocks it would change, to accept or reject there.
 */
withDefaults(defineProps<{
  /** The agent to join to this editor, from `useAgent`. */
  agent: AgentController
  /** Whether to show the bar with the count and the accept-all and reject-all buttons. */
  bar?: boolean
}>(), { bar: true })
</script>

<template>
  <AgentBinding :agent="agent" />
  <ReviewLayer :agent="agent" :bar="bar" />
</template>
