<script setup lang="ts">
import type { PollProps } from '../poll'
import { inject } from 'vue'
import { formatCloseAt } from '../poll'
import { PollContextKey } from '../poll-adapter'
import PollVote from './PollVote.vue'

defineProps<PollProps>()

// With a backend, a poll it can know about is voted on; without one, it only shows its options.
const context = inject(PollContextKey, null)
</script>

<template>
  <PollVote
    v-if="context?.enabled && pollId && options.length"
    v-bind="$props"
    :poll-id="pollId"
    :context="context"
  />
  <div v-else class="hlx-poll" :data-mode="mode">
    <p v-if="question" class="hlx-poll-question">
      {{ question }}
    </p>
    <ul class="hlx-poll-options">
      <li v-for="option in options" :key="option.id" class="hlx-poll-option">
        <span class="hlx-poll-label">{{ option.label }}</span>
      </li>
    </ul>
    <p class="hlx-poll-meta">
      <span>{{ mode === 'multiple' ? '可複選' : '單選' }}</span>
      <template v-if="closeAt">
        <span aria-hidden="true"> · </span>
        <span>截止於 <time :datetime="closeAt">{{ formatCloseAt(closeAt) }}</time></span>
      </template>
    </p>
  </div>
</template>
