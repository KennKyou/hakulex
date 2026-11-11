<script setup lang="ts">
import { REPOSITORY } from '../../site/home'
import GithubIcon from '../shell/GithubIcon.vue'
import LogoMark from '../shell/LogoMark.vue'
import ThemeButton from '../shell/ThemeButton.vue'

/* The bar along the top of the home page. */
defineEmits<{ search: [] }>()

// The sidebar's sections, by the same names.
const links = [
  { label: '編輯器', to: '/editor' },
  { label: '範例', to: '/presets' },
  { label: '節點', to: '/nodes' },
  { label: '外掛', to: '/plugins' },
  { label: '套件', to: '/packages' },
]
const shortcut = /mac/i.test(navigator.platform)
  ? '⌘K'
  : 'Ctrl K'
</script>

<template>
  <header class="home-header">
    <RouterLink to="/" class="home-brand">
      <LogoMark :size="24" />
      hakulex
    </RouterLink>
    <nav class="home-nav" aria-label="網站導覽">
      <RouterLink v-for="link in links" :key="link.to" :to="link.to">
        {{ link.label }}
      </RouterLink>
    </nav>
    <div class="home-tools">
      <button type="button" class="home-search" aria-label="搜尋" @click="$emit('search')">
        <svg class="home-search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
        <span class="home-search-label">搜尋</span>
        <kbd>{{ shortcut }}</kbd>
      </button>
      <ThemeButton />
      <a class="home-github" :href="REPOSITORY" target="_blank" rel="noopener noreferrer" aria-label="GitHub" title="GitHub">
        <GithubIcon :size="18" />
      </a>
    </div>
  </header>
</template>

<style scoped>
.home-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 32px;
  box-sizing: border-box;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px 40px;
  border-right: 1px solid var(--hlx-color-border);
  border-left: 1px solid var(--hlx-color-border);
}

.home-brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--hlx-color-text);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  text-decoration: none;
}

.home-nav {
  display: flex;
  gap: 24px;
  min-width: 0;
  /* On a narrow screen it scrolls sideways rather than wrapping or widening the page. */
  overflow-x: auto;
  white-space: nowrap;
  scrollbar-width: none;
}

.home-nav::-webkit-scrollbar {
  display: none;
}

a {
  color: var(--hlx-color-text-secondary);
  font-size: 14px;
  text-decoration: none;
}

a:hover {
  color: var(--hlx-color-text);
}

.home-brand:hover {
  color: var(--hlx-color-text);
}

.home-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin-left: auto;
}

.home-search {
  display: flex;
  align-items: center;
  gap: 8px;
  /* Wide enough to read as a search box, narrower where the bar is short of room. */
  width: clamp(160px, 22vw, 260px);
  height: 32px;
  padding: 0 8px 0 10px;
  border: 1px solid var(--hlx-color-border);
  border-radius: 8px;
  background: transparent;
  color: var(--hlx-color-text-tertiary);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.home-search:hover {
  color: var(--hlx-color-text-secondary);
}

kbd {
  padding: 0 5px;
  border: 1px solid var(--hlx-color-border);
  border-radius: 4px;
  font-family: var(--hlx-font-mono);
  font-size: 11px;
  line-height: 18px;
}

.home-search-icon {
  flex: none;
  width: 14px;
  height: 14px;
}

.home-search kbd {
  margin-left: auto;
}

/*
 * On a phone: the name and three small buttons on one row, the links on the next. The search
 * box folds into one button.
 */
@media (max-width: 767px) {
  .home-header {
    gap: 10px 12px;
    padding: 12px 16px;
  }

  .home-nav {
    order: 3;
    flex-basis: 100%;
    gap: 20px;
  }

  .home-tools {
    flex-wrap: nowrap;
    gap: 4px;
  }

  .home-search-label,
  kbd {
    display: none;
  }

  .home-search-icon {
    width: 16px;
    height: 16px;
  }

  .home-search {
    display: inline-flex;
    gap: 0;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--hlx-color-text-secondary);
    cursor: pointer;
  }

  .home-search:hover {
    background: var(--hlx-color-fill-secondary);
    color: var(--hlx-color-text);
  }
}

.home-github {
  display: inline-flex;
  padding: 4px;
  border-radius: 6px;
}

.home-github:hover {
  background: var(--hlx-color-fill-secondary);
  color: var(--hlx-color-text);
}
</style>
