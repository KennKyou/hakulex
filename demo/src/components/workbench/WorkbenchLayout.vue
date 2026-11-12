<script setup lang="ts">
/* A bar on top, the work below it, and a panel of tools beside it. */
defineProps<{ title: string }>()
</script>

<template>
  <div class="wb">
    <div class="wb-main">
      <header class="wb-bar">
        <h1>{{ title }}</h1>
        <slot name="meta" />
      </header>
      <slot />
    </div>
    <aside class="wb-panel" aria-label="工具面板">
      <slot name="panel" />
    </aside>
  </div>
</template>

<style scoped>
.wb {
  display: flex;
  min-height: 100vh;
}

.wb-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.wb-bar {
  position: sticky;
  top: 0;
  /* Over the editor's toolbar (30), under what floats over the editor (40 and up). */
  z-index: 31;
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  box-sizing: border-box;
  min-height: 44px;
  padding: 4px 16px 4px 32px;
  border-bottom: 1px solid var(--hlx-color-border);
  background: var(--hlx-color-bg);
}

h1 {
  margin: 0;
  color: var(--hlx-color-text);
  font-size: 15px;
  font-weight: 600;
}

.wb-panel {
  position: sticky;
  top: 0;
  /* A page may ask for more room with this. */
  flex: 0 0 var(--wb-panel-width, 300px);
  align-self: flex-start;
  box-sizing: border-box;
  height: 100vh;
  overflow-y: auto;
  border-left: 1px solid var(--hlx-color-border);
  background: var(--hlx-color-bg);
  color: var(--hlx-color-text);
}

@media (max-width: 1023px) {
  .wb {
    flex-direction: column;
  }

  .wb-main {
    flex: none;
  }

  .wb-panel {
    position: static;
    flex: none;
    align-self: stretch;
    height: auto;
    border-top: 1px solid var(--hlx-color-border);
    border-left: 0;
  }
}

@media (max-width: 767px) {
  .wb-bar {
    position: static;
    padding-left: 16px;
  }
}
</style>
