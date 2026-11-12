<script setup lang="ts">
/* How much there is left to review, with the ways to walk through it and to answer it all at once. */
defineProps<{
  total: number
  conflicts: number
  disabled: boolean
}>()
defineEmits<{
  step: [by: 1 | -1]
  acceptAll: []
  rejectAll: []
}>()
</script>

<template>
  <div class="hlx-agent-bar" role="toolbar" aria-label="AI 審查">
    <span class="hlx-agent-bar-count" aria-live="polite">
      AI 提議了 {{ total }} 項修改<template v-if="conflicts">，其中 {{ conflicts }} 項衝突</template>
    </span>
    <span class="hlx-agent-bar-actions">
      <button type="button" class="hlx-agent-button" aria-label="上一項修改" @click="$emit('step', -1)">
        上一個
      </button>
      <button type="button" class="hlx-agent-button" aria-label="下一項修改" @click="$emit('step', 1)">
        下一個
      </button>
      <button type="button" class="hlx-agent-button" data-primary aria-label="接受全部待審的修改" :disabled="disabled" @click="$emit('acceptAll')">
        全部接受
      </button>
      <button type="button" class="hlx-agent-button" aria-label="拒絕全部修改" :disabled="disabled" @click="$emit('rejectAll')">
        全部拒絕
      </button>
    </span>
  </div>
</template>
