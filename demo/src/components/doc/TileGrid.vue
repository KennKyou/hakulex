<script setup lang="ts">
/* Cards that lead to the pages of a section. */
export interface Tile {
  to: string
  title: string
  code?: string
  note?: string
}

withDefaults(defineProps<{
  tiles: Tile[]
  tileClass: string
  min?: string
}>(), { min: '240px' })
</script>

<template>
  <div class="tiles" :style="{ '--tile-min': min }">
    <RouterLink v-for="tile in tiles" :key="tile.to" :to="tile.to" class="tile" :class="tileClass">
      <strong>{{ tile.title }}</strong>
      <code v-if="tile.code">{{ tile.code }}</code>
      <span v-if="tile.note">{{ tile.note }}</span>
    </RouterLink>
  </div>
</template>

<style scoped>
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--tile-min), 1fr));
  gap: 12px;
}

.tile {
  display: grid;
  align-content: start;
  gap: 4px;
  padding: 16px;
  border: 1px solid var(--hlx-color-border);
  border-radius: 12px;
  color: var(--hlx-color-text);
  text-decoration: none;
  transition: border-color 0.15s;
}

.tile:hover {
  border-color: var(--hlx-color-text-tertiary);
}

strong {
  font-size: 14px;
  font-weight: 600;
}

code {
  color: var(--hlx-color-text-tertiary);
  font-family: var(--hlx-font-mono);
  font-size: 12px;
}

span {
  color: var(--hlx-color-text-secondary);
  font-size: 13px;
  line-height: 20px;
}
</style>
