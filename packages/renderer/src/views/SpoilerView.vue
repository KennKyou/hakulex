<script setup lang="ts">
import { shallowRef } from 'vue'

const shown = shallowRef(false)
const rehidden = shallowRef(false)

function toggle() {
  shown.value = !shown.value
  rehidden.value = !shown.value
}

function onClick(event: MouseEvent) {
  // A hidden link can't be read yet, so the first click only shows it.
  if (!shown.value)
    event.preventDefault()
  else if ((event.target as Element).closest('a'))
    return
  toggle()
}

function onKeydown(event: KeyboardEvent) {
  if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' '))
    return
  event.preventDefault()
  toggle()
}
</script>

<template>
  <span
    class="hlx-spoiler"
    :class="{ 'hlx-spoiler--hidden': !shown }"
    role="button"
    tabindex="0"
    :aria-expanded="shown"
    :data-rehidden="rehidden ? '' : undefined"
    @click="onClick"
    @keydown="onKeydown"
    @mouseleave="rehidden = false"
    @blur="rehidden = false"
  ><slot /></span>
</template>
