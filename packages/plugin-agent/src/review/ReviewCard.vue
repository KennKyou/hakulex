<script setup lang="ts">
import type { Placed } from './layout'
import { useEditorTheme } from '@hakulex/editor'
import { RichRenderer } from '@hakulex/renderer'
import { computed } from 'vue'

/*
 * One proposed change, drawn as part of the page: the text it would leave, with what goes
 * struck through and what comes marked, and the two answers beside it. It is not part of the
 * document and can't be typed into.
 */
const props = defineProps<{
  entry: Placed
  current: boolean
  disabled: boolean
}>()
const emit = defineEmits<{
  accept: [overwrite: boolean]
  reject: []
}>()

const theme = useEditorTheme()
const item = computed(() => props.entry.item)
const conflict = computed(() => item.value.state === 'conflict')
const label = computed(() => `AI 提議的${item.value.kind === 'replace'
  ? '修改'
  : item.value.kind === 'delete'
    ? '刪除'
    : '新增'}${conflict.value ? '（衝突）' : ''}`)

const answers = computed(() => conflict.value
  ? [
      {
        text: '保留我的',
        name: '保留我的內容，拒絕這項修改',
        run: () => emit('reject'),
      },
      {
        text: '改用 AI 的',
        name: '改用 AI 的內容，接受這項修改',
        run: () => emit('accept', true),
      },
    ]
  : [
      {
        text: '✓',
        name: '接受這項修改',
        run: () => emit('accept', false),
      },
      {
        text: '✕',
        name: '拒絕這項修改',
        run: () => emit('reject'),
      },
    ])
</script>

<template>
  <div
    class="hlx-agent-card"
    role="group"
    tabindex="-1"
    :aria-label="label"
    :data-kind="item.kind"
    :data-state="item.state"
    :data-mode="entry.mode"
    :data-anchor="entry.anchor"
    :data-current="current ? 'true' : undefined"
  >
    <div class="hlx-agent-card-main">
      <p v-if="conflict" class="hlx-agent-card-title">
        衝突：你在 AI 提議之後改了這一段。下面是 AI 的版本。
      </p>
      <RichRenderer
        v-if="entry.content"
        class="hlx-agent-card-body"
        :value="entry.content"
        :variant="theme.variant"
        :color-scheme="theme.colorScheme"
        :heading-ids="false"
      />
    </div>
    <span class="hlx-agent-card-actions">
      <button
        v-for="answer in answers"
        :key="answer.text"
        type="button"
        class="hlx-agent-button"
        :data-icon="conflict ? undefined : ''"
        :aria-label="answer.name"
        :title="answer.name"
        :disabled="disabled"
        @click="answer.run"
      >
        {{ answer.text }}
      </button>
    </span>
  </div>
</template>
