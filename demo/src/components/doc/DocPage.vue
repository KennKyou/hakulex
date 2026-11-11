<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { usePageMeta } from '../../site/seo'
import '../../site/doc.css'

/* The frame of a document page: where it is, what it is, its content, and its sections. */
export interface Crumb {
  label: string
  to?: string
}
export interface PagerLink {
  label: string
  to: string
}

const props = withDefaults(defineProps<{
  crumbs: Crumb[]
  title: string
  lead?: string
  wide?: boolean
  /** List the page's sections beside it. */
  toc?: boolean
  previous?: PagerLink
  next?: PagerLink
}>(), { toc: true })

// The page's name, then the section it belongs to: the crumb that leads back to its overview.
usePageMeta(() => [props.title, props.crumbs.find(crumb => crumb.to)?.label ?? ''], () => props.lead)

const article = ref<HTMLElement>()
const entries = ref<{ id: string, label: string }[]>([])
const current = ref<string>()
let observer: IntersectionObserver | undefined

/* The page's own headings only: a sample's headings don't have this class. */
onMounted(() => {
  if (!props.toc || !article.value)
    return
  const headings = [
    ...article.value.querySelectorAll<HTMLElement>('.doc-h2'),
  ]
  headings.forEach((heading, index) => heading.id = `section-${index + 1}`)
  entries.value = headings.map(heading => ({ id: heading.id, label: heading.textContent?.trim() ?? '' }))
  current.value = entries.value[0]?.id
  observer = new IntersectionObserver((records) => {
    const seen = records.find(record => record.isIntersecting)
    if (seen)
      current.value = seen.target.id
  }, { rootMargin: '0px 0px -70% 0px' })
  headings.forEach(heading => observer?.observe(heading))
})
onBeforeUnmount(() => observer?.disconnect())

function goTo(id: string) {
  document.getElementById(id)?.scrollIntoView()
  current.value = id
}
</script>

<template>
  <div class="doc" :class="{ 'doc-wide': wide }">
    <article ref="article" class="doc-article">
      <nav class="doc-crumbs" aria-label="麵包屑">
        <template v-for="(crumb, index) in crumbs" :key="crumb.label">
          <span v-if="index" aria-hidden="true">/</span>
          <RouterLink v-if="crumb.to" :to="crumb.to">{{ crumb.label }}</RouterLink>
          <span v-else>{{ crumb.label }}</span>
        </template>
      </nav>
      <h1 class="doc-title">
        {{ title }}
      </h1>
      <p v-if="lead || $slots.lead" class="doc-lead">
        <slot name="lead">
          {{ lead }}
        </slot>
      </p>
      <div v-if="$slots.meta" class="doc-meta">
        <slot name="meta" />
      </div>
      <div class="doc-body">
        <slot />
      </div>
      <nav v-if="previous || next" class="doc-pager" aria-label="相鄰頁面">
        <RouterLink v-if="previous" :to="previous.to">
          上一個：{{ previous.label }}
        </RouterLink>
        <RouterLink v-if="next" :to="next.to" class="doc-pager-next">
          下一個：{{ next.label }}
        </RouterLink>
      </nav>
    </article>
    <aside v-if="entries.length > 1" class="doc-toc" aria-label="本頁內容">
      <div class="doc-toc-label">
        本頁內容
      </div>
      <a
        v-for="entry in entries"
        :key="entry.id"
        :href="`#${entry.id}`"
        :aria-current="current === entry.id ? 'true' : undefined"
        @click.prevent="goTo(entry.id)"
      >{{ entry.label }}</a>
    </aside>
  </div>
</template>
