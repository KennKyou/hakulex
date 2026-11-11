<script setup lang="ts">
/* One feature: what it is, and a piece of it to try. */
defineProps<{ title: string, description: string }>()
</script>

<template>
  <section class="feature">
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <div class="feature-demo">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.feature {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 32px 40px;
}

h3 {
  margin: 0;
  color: var(--hlx-color-text);
  font-size: 20px;
  font-weight: 600;
}

p {
  margin: 8px 0 24px;
  color: var(--hlx-color-text-secondary);
  font-size: 15px;
  line-height: 1.6;
}

.feature-demo {
  flex: 1;
  min-width: 0;
  max-height: 340px;
  padding: 20px;
  overflow: auto;
  border: 1px solid var(--hlx-color-border);
  border-radius: 12px;
  background: var(--hlx-color-bg-secondary);
}

@media (max-width: 767px) {
  .feature {
    padding: 24px 16px;
  }
}
</style>
