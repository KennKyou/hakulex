<script lang="ts">
import { computed, defineComponent, ref } from 'vue'
import { useRoute } from 'vue-router'
import HomeHeader from './components/home/HomeHeader.vue'
import ImageLightbox from './components/shell/ImageLightbox.vue'
import SearchPalette from './components/shell/SearchPalette.vue'
import SiteSidebar from './components/shell/SiteSidebar.vue'
import { playgroundDoc } from './site/playground'
import { siteScheme } from './site/theme'

/* The site around the pages: the side navigation, search, and the page. */
export default defineComponent({
  components: {
    HomeHeader,
    ImageLightbox,
    SearchPalette,
    SiteSidebar,
  },
  setup() {
    const route = useRoute()
    return {
      siteScheme,
      searching: ref(false),
      isHome: computed(() => route.path === '/'),
      // A new page of a section is a new page: nothing carries over from the last one.
      pageKey: computed(() => (route.params.type ?? route.params.id) as string | undefined),
      // E2E set the playground's document through the app's root instance, as they did when
      // the playground was the whole app: `__vue_app__._instance.setupState.doc = …`.
      doc: playgroundDoc,
    }
  },
})
</script>

<template>
  <div class="hlx-root site" :class="{ 'site-home': isHome }" :data-color-scheme="siteScheme">
    <HomeHeader v-if="isHome" @search="searching = true" />
    <SiteSidebar v-else @search="searching = true" />
    <div class="site-content">
      <RouterView :key="pageKey" />
    </div>
    <SearchPalette v-model:open="searching" />
    <ImageLightbox />
  </div>
</template>

<style>
.site {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  min-height: 100vh;
  background: var(--hlx-color-bg);
  color: var(--hlx-color-text);
  font-family: var(--hlx-font-family-sans);
}

.site-home {
  display: block;
}

.site-content {
  min-width: 0;
}

/*
 * A press on the margins beside the home page would put the caret in its editor, the nearest
 * thing to type in. The page itself turns selecting back on.
 */
.site-home .site-content {
  user-select: none;
}

.site-home .home {
  user-select: text;
}

@media (max-width: 767px) {
  .site {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto 1fr;
  }
}
</style>
