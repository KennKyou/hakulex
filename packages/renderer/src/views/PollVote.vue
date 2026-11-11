<script setup lang="ts">
import type { PollProps } from '../poll'
import type { PollContext } from '../poll-adapter'
import { computed, onMounted, shallowRef, useId, watch } from 'vue'
import { formatCloseAt } from '../poll'

const props = defineProps<PollProps & { pollId: string, context: PollContext }>()

const name = useId()
const entry = computed(() => props.context.entry(props.pollId))
const state = computed(() => entry.value.status === 'ready'
  ? entry.value.state
  : null)
const submitting = shallowRef(false)
const failed = shallowRef(false)
const chosen = shallowRef<string[]>([])

// Starts from what the reader voted for, so voting again shows where they stand.
watch(() => state.value?.userVote, (vote) => {
  chosen.value = vote
    ? [...vote]
    : []
}, { immediate: true })

onMounted(() => props.context.request(props.pollId))

const canVote = computed(() => !!state.value?.canVote && !state.value.closed)
const showCounts = computed(() => {
  const current = state.value
  if (!current)
    return false
  if (props.showResults === 'after-vote')
    return !!current.userVote || current.closed
  if (props.showResults === 'after-close')
    return current.closed
  return true
})

function share(id: string) {
  const total = state.value?.totalVotes ?? 0
  return total
    ? Math.round((state.value!.tallies[id] ?? 0) / total * 100)
    : 0
}

function toggle(id: string, on: boolean) {
  failed.value = false
  chosen.value = props.mode === 'multiple'
    ? props.options.map(option => option.id).filter(option => option === id
        ? on
        : chosen.value.includes(option))
    : [id]
}

async function submit() {
  if (!chosen.value.length || submitting.value)
    return
  submitting.value = true
  failed.value = false
  try {
    await props.context.vote(props.pollId, chosen.value)
  }
  catch {
    failed.value = true
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="hlx-poll" :data-mode="mode" :data-poll-id="pollId">
    <p v-if="question" class="hlx-poll-question">
      {{ question }}
    </p>
    <ul class="hlx-poll-options">
      <li
        v-for="option in options"
        :key="option.id"
        class="hlx-poll-option"
        :data-chosen="state?.userVote?.includes(option.id) || undefined"
        :style="showCounts ? { '--hlx-poll-share': `${share(option.id)}%` } : undefined"
      >
        <span v-if="showCounts" class="hlx-poll-bar" aria-hidden="true" />
        <span class="hlx-poll-row">
          <label v-if="canVote">
            <input
              :type="mode === 'multiple' ? 'checkbox' : 'radio'"
              :name="name"
              :value="option.id"
              :checked="chosen.includes(option.id)"
              :disabled="submitting"
              @change="toggle(option.id, ($event.target as HTMLInputElement).checked)"
            >
            <span class="hlx-poll-label">{{ option.label }}</span>
          </label>
          <span v-else class="hlx-poll-label">{{ option.label }}</span>
          <span v-if="showCounts" class="hlx-poll-count">{{ state!.tallies[option.id] ?? 0 }} · {{ share(option.id) }}%</span>
        </span>
      </li>
    </ul>
    <div class="hlx-poll-footer">
      <button v-if="canVote" type="button" :disabled="!chosen.length || submitting" @click="submit">
        {{ state?.userVote ? '更改投票' : '投票' }}
      </button>
      <span>{{ mode === 'multiple' ? '可複選' : '單選' }}</span>
      <span v-if="entry.status === 'loading'">讀取中…</span>
      <span v-if="showCounts">共 {{ state!.totalVotes }} 票</span>
      <span v-if="state?.closed">已截止</span>
      <span v-else-if="closeAt">截止於 <time :datetime="closeAt">{{ formatCloseAt(closeAt) }}</time></span>
      <span v-if="entry.status === 'error'" class="hlx-poll-error" role="alert">無法讀取投票結果。</span>
      <span v-if="failed" class="hlx-poll-error" role="alert">投票失敗，請再試一次。</span>
    </div>
  </div>
</template>
