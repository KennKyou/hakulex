<script setup lang="ts">
import type { NavSection } from '../../site/nav'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { version } from '../../../../packages/editor/package.json'
import { REPOSITORY } from '../../site/home'
import { navGroups } from '../../site/nav'
import GithubIcon from './GithubIcon.vue'
import LogoMark from './LogoMark.vue'
import ThemeButton from './ThemeButton.vue'

/* The site's name, search, navigation and color theme. */
defineEmits<{ search: [] }>()

const route = useRoute()
function inside(section: NavSection) {
  return route.path === section.path
    || route.path.startsWith(`${section.path}/`)
    || !!section.aliases?.includes(route.path)
}
const here = (path: string) => route.path === path

const isMac = /mac/i.test(navigator.platform)
const shortcut = computed(() => isMac ? '⌘K' : 'Ctrl K')

// The navigation scrolls by itself; only it should move, not the page.
const list = ref<HTMLElement>()
function revealCurrent() {
  const link = list.value?.querySelector('[aria-current="page"]')
  if (!list.value || !link)
    return
  const area = list.value.getBoundingClientRect()
  const box = link.getBoundingClientRect()
  if (box.top < area.top || box.bottom > area.bottom)
    list.value.scrollTop += box.top - area.top - (area.height - box.height) / 2
}
onMounted(revealCurrent)
watch(() => route.path, revealCurrent, { flush: 'post' })
</script>

<template>
  <aside class="site-side">
    <div class="site-side-head">
      <RouterLink to="/" class="site-name">
        <LogoMark :size="20" />
        hakulex
      </RouterLink>
      <span class="site-version">v{{ version }}</span>
    </div>
    <button type="button" class="site-search" @click="$emit('search')">
      搜尋
      <kbd>{{ shortcut }}</kbd>
    </button>
    <nav ref="list" class="site-nav" aria-label="網站導覽">
      <section v-for="group in navGroups" :key="group.label" class="site-nav-group">
        <h2 class="site-nav-label">
          {{ group.label }}
        </h2>
        <template v-for="section in group.sections" :key="section.path">
          <RouterLink
            :to="section.path"
            class="site-nav-section"
            :data-active="inside(section) || undefined"
            :aria-current="!section.tree && inside(section) ? 'page' : undefined"
          >
            {{ section.label }}
            <span v-if="section.count" class="site-nav-count">{{ section.count }}</span>
          </RouterLink>
          <div v-if="section.tree && inside(section)" class="site-nav-tree">
            <div v-for="(tree, index) in section.tree" :key="tree.label ?? index" class="site-nav-tree-group">
              <div v-if="tree.label" class="site-nav-tree-label">
                {{ tree.label }}
              </div>
              <RouterLink
                v-for="item in tree.items"
                :key="item.path"
                :to="item.path"
                class="site-nav-leaf"
                :aria-current="here(item.path) ? 'page' : undefined"
              >
                {{ item.label }}
              </RouterLink>
            </div>
          </div>
        </template>
      </section>
    </nav>
    <footer class="site-side-foot">
      <a class="site-github" :href="REPOSITORY" target="_blank" rel="noopener noreferrer" aria-label="GitHub" title="GitHub">
        <GithubIcon :size="18" />
      </a>
      <ThemeButton />
    </footer>
  </aside>
</template>

<style scoped>
.site-side {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  align-self: start;
  box-sizing: border-box;
  height: 100vh;
  border-right: 1px solid var(--hlx-color-border);
  background: var(--hlx-color-bg);
}

.site-side-head {
  display: flex;
  flex: none;
  align-items: center;
  height: 44px;
  padding: 0 20px;
}

.site-name {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--hlx-color-text);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  text-decoration: none;
}

.site-version,
.site-search kbd {
  padding: 0 6px;
  border: 1px solid var(--hlx-color-border);
  border-radius: 4px;
  color: var(--hlx-color-text-tertiary);
  font-family: var(--hlx-font-mono);
  font-size: 11px;
  font-weight: 500;
  line-height: 18px;
}

.site-version {
  margin-left: auto;
}

.site-search {
  display: flex;
  flex: none;
  align-items: center;
  height: 32px;
  margin: 4px 12px 12px;
  padding: 0 8px 0 10px;
  border: 1px solid var(--hlx-color-border);
  border-radius: 8px;
  background: transparent;
  color: var(--hlx-color-text-tertiary);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.site-search:hover {
  color: var(--hlx-color-text-secondary);
}

.site-search kbd {
  margin-left: auto;
}

.site-nav {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
  padding: 4px 12px 24px;
  overflow-y: auto;
}

.site-nav-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.site-nav-label {
  margin: 0;
  padding: 0 10px 6px;
  color: var(--hlx-color-text-tertiary);
  font-size: 12px;
  font-weight: 500;
}

.site-nav-section {
  display: flex;
  flex: none;
  align-items: center;
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  color: var(--hlx-color-text-secondary);
  font-size: 14px;
  text-decoration: none;
}

.site-nav-section:hover {
  background: var(--hlx-color-fill-secondary);
  color: var(--hlx-color-text);
}

.site-nav-section[data-active] {
  background: var(--hlx-color-fill);
  color: var(--hlx-color-text);
  font-weight: 500;
}

.site-nav-count {
  margin-left: auto;
  color: var(--hlx-color-text-tertiary);
  font-size: 12px;
  font-weight: 400;
}

.site-nav-tree {
  display: flex;
  flex-direction: column;
  margin: 4px 0 8px 14px;
  border-left: 1px solid var(--hlx-color-border);
}

.site-nav-tree-label {
  margin-top: 8px;
  padding: 4px 12px;
  color: var(--hlx-color-text-tertiary);
  font-size: 11px;
  font-weight: 500;
}

.site-nav-leaf {
  display: block;
  margin-left: -1px;
  padding: 3px 12px;
  border-left: 1px solid transparent;
  color: var(--hlx-color-text-secondary);
  font-size: 13px;
  line-height: 22px;
  text-decoration: none;
}

.site-nav-leaf:hover {
  color: var(--hlx-color-text);
}

.site-nav-leaf[aria-current='page'] {
  border-left-color: var(--hlx-color-text);
  color: var(--hlx-color-text);
  font-weight: 500;
}

.site-side-foot {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px 10px 20px;
  border-top: 1px solid var(--hlx-color-border);
  font-size: 13px;
}

.site-side-foot a {
  color: var(--hlx-color-text-secondary);
  text-decoration: none;
}

.site-github {
  display: inline-flex;
  padding: 4px;
  margin-left: -4px;
  border-radius: 6px;
}

.site-github:hover {
  background: var(--hlx-color-fill-secondary);
  color: var(--hlx-color-text);
}

@media (max-width: 767px) {
  .site-side {
    position: static;
    height: auto;
    border-right: none;
    border-bottom: 1px solid var(--hlx-color-border);
  }

  .site-search {
    margin-bottom: 4px;
  }

  .site-nav {
    flex-flow: row wrap;
    gap: 2px;
    padding: 4px 12px;
    overflow: visible;
  }

  .site-nav-group {
    flex-flow: row wrap;
  }

  .site-nav-label,
  .site-nav-count,
  .site-nav-tree {
    display: none;
  }

  .site-side-foot {
    padding: 8px 12px;
    border-top: 0;
  }
}
</style>
