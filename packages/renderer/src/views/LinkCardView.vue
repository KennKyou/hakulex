<script setup lang="ts">
import type { FunctionalComponent } from 'vue'
import type { LinkCardProps } from '../link-card'
import type { LinkCardData, LinkCardIconName, LinkCardPart } from '../link-card-providers'
import { computed, h, inject, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { CALLOUT_ICON_ATTRS, GLOBE, LINK_CARD_ICONS } from '../callout-icons'
import { builtinLinkCardProviders, fetchLinkCard, LinkCardSettingsKey, matchLinkCardUrl, mergeLinkCardProviders } from '../link-card-providers'

const props = defineProps<LinkCardProps & {
  /** In an editor a click selects the card, so it isn't a link there. */
  static?: boolean
}>()

const settings = inject(LinkCardSettingsKey, () => undefined)

/*
 * A source that knows this card: the one the document names, when there is a provider of that
 * name, or the first that knows its address. None when the site turned fetching off.
 */
const known = computed(() => {
  const current = settings()
  if (current?.enabled === false || !props.href)
    return null
  const providers = current?.providers?.length
    ? mergeLinkCardProviders(builtinLinkCardProviders, current.providers)
    : builtinLinkCardProviders
  const named = props.source && props.sourceId
    ? providers.find(provider => provider.name === props.source)
    : undefined
  const found = named
    ? {
        provider: named,
        match: { id: props.sourceId! },
      }
    : matchLinkCardUrl(props.href, providers)
  return found && found.provider.isValidId(found.match.id)
    ? found
    : null
})

type State = 'idle' | 'loading' | 'done' | 'failed'
const state = shallowRef<State>('idle')
const fetched = shallowRef<LinkCardData | null>(null)
const box = useTemplateRef<{ $el?: Element } | Element>('box')
let observer: IntersectionObserver | null = null
// Bumped on each fetch and on leaving, so an answer for an earlier address is dropped.
let attempt = 0

async function load() {
  const target = known.value
  if (!target)
    return
  const id = ++attempt
  state.value = 'loading'
  try {
    const data = await fetchLinkCard(target.provider, target.match.id, settings())
    if (id !== attempt)
      return
    fetched.value = data
    state.value = data
      ? 'done'
      : 'failed'
  }
  catch (error) {
    if (id !== attempt)
      return
    console.error(`[hakulex link card] ${target.provider.name}:`, error)
    state.value = 'failed'
  }
}

function element() {
  const value = box.value
  return value instanceof Element
    ? value
    : value?.$el ?? null
}

/** Fetches once the card comes near the screen, as dynamic blocks load. */
function start() {
  observer?.disconnect()
  observer = null
  attempt++
  fetched.value = null
  state.value = 'idle'
  if (!known.value)
    return
  if (typeof IntersectionObserver === 'undefined') {
    void load()
    return
  }
  const watched = element()
  if (!watched)
    return
  observer = new IntersectionObserver((entries) => {
    if (!entries.some(entry => entry.isIntersecting))
      return
    observer?.disconnect()
    observer = null
    void load()
  }, { rootMargin: '400px 0px' })
  observer.observe(watched)
}

onMounted(start)
watch(() => known.value && `${known.value.provider.name}\n${known.value.match.id}`, () => nextTick(start))
onBeforeUnmount(() => {
  attempt++
  observer?.disconnect()
})

/*
 * What the card shows. A card with a stored title shows it until something better comes, and
 * keeps it if nothing does; one with only its address holds its place with a placeholder, and
 * says so if the fetch fails.
 */
const loading = computed(() => !!known.value && props.untitled === true && (state.value === 'idle' || state.value === 'loading'))
const failed = computed(() => !!known.value && props.untitled === true && state.value === 'failed')
const shape = computed(() => known.value?.provider.shape ?? (known.value
  ? 'compact'
  : undefined))
const title = computed(() => fetched.value?.title ?? props.title)
const description = computed(() => fetched.value?.description ?? props.description)
const image = computed(() => fetched.value?.image ?? props.image)
const color = computed(() => fetched.value?.color)
const href = computed(() => known.value?.match.fullUrl ?? props.href)

// A picture that won't load gives way to the icon, and an icon that won't to the globe.
const faviconFailed = shallowRef(false)
const imageFailed = shallowRef(false)
watch(() => props.favicon, () => faviconFailed.value = false)
watch(image, () => imageFailed.value = false)

/*
 * Without a description, or with one of two lines or fewer, the content is centered beside the
 * picture. Only the browser can measure, so the server centers only the first.
 */
const short = shallowRef(false)
const descriptionBox = useTemplateRef<HTMLElement>('descriptionBox')
function measure() {
  const measured = descriptionBox.value
  if (!measured) {
    short.value = false
    return
  }
  const lineHeight = Number.parseFloat(getComputedStyle(measured).lineHeight) || 1.5 * 14
  short.value = measured.scrollHeight <= lineHeight * 2 + 1
}
onMounted(measure)
watch(() => [description.value, title.value], () => nextTick(measure))
const centered = computed(() => !description.value || short.value)

const link = computed(() => !!href.value && !props.static)
const linkAttrs = computed(() => link.value
  ? { href: href.value, target: '_blank', rel: 'noopener noreferrer' }
  : {})

function svg(shapes: readonly { tag: string, attrs: object }[]) {
  return h('svg', { ...CALLOUT_ICON_ATTRS, 'aria-hidden': 'true' }, shapes.map(shape => h(shape.tag, shape.attrs as Record<string, string>)))
}
const Globe: FunctionalComponent = () => svg(GLOBE)
const Icon: FunctionalComponent<{ name: LinkCardIconName }> = props => svg(LINK_CARD_ICONS[props.name])
Icon.props = ['name']
const Part: FunctionalComponent<{ part: LinkCardPart }> = ({ part }) => h('span', {
  'class': part.group
    ? 'hlx-link-card-part hlx-link-card-group'
    : 'hlx-link-card-part',
  'data-tone': part.tone,
  'style': part.color
    ? { color: part.color }
    : undefined,
}, part.group
  ? part.group.map(item => h(Part, { part: item }))
  : [part.icon && svg(LINK_CARD_ICONS[part.icon]), part.text])
Part.props = ['part']
</script>

<template>
  <component
    :is="link ? 'a' : 'div'"
    v-if="loading"
    ref="box"
    class="hlx-link-card"
    data-loading=""
    :data-shape="shape"
    v-bind="linkAttrs"
  >
    <span class="hlx-link-card-image" /><span class="hlx-link-card-content"><span class="hlx-link-card-title"><span class="hlx-link-card-title-text" /></span><span class="hlx-link-card-description" /><span class="hlx-link-card-description" /></span>
  </component>
  <component
    :is="link ? 'a' : 'div'"
    v-else-if="failed"
    ref="box"
    class="hlx-link-card"
    data-failed=""
    v-bind="linkAttrs"
  >
    <span class="hlx-link-card-icon"><Icon name="unlink" /></span><span class="hlx-link-card-content"><span class="hlx-link-card-failed-url">{{ host }}</span><span class="hlx-link-card-failed-hint">無法預覽・仍可前往</span></span>
  </component>
  <component
    :is="link ? 'a' : 'div'"
    v-else
    ref="box"
    class="hlx-link-card"
    :data-centered="centered ? '' : undefined"
    :data-shape="shape"
    :data-tinted="color ? '' : undefined"
    :style="color ? { '--hlx-link-card-color': color } : undefined"
    v-bind="linkAttrs"
  >
    <span v-if="color" class="hlx-link-card-tint" />
    <img
      v-if="image && !imageFailed"
      class="hlx-link-card-image"
      :src="image"
      alt=""
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      @error="imageFailed = true"
    >
    <span v-else class="hlx-link-card-icon"><img
      v-if="favicon && !faviconFailed"
      :src="favicon"
      alt=""
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      @error="faviconFailed = true"
    ><Globe v-else /></span>
    <span class="hlx-link-card-content"><span class="hlx-link-card-title"><span class="hlx-link-card-title-text" :data-plain="fetched?.plainTitle ? '' : undefined">{{ title }}</span><span
      v-if="fetched?.badge"
      class="hlx-link-card-badge"
      :data-mono="fetched.badge.mono ? '' : undefined"
      :style="fetched.badge.color ? { color: fetched.badge.color } : undefined"
    ><Icon v-if="fetched.badge.icon" :name="fetched.badge.icon" />{{ fetched.badge.text }}</span></span><span v-if="description" ref="descriptionBox" class="hlx-link-card-description"><span v-if="Array.isArray(description)" class="hlx-link-card-parts"><Part v-for="(part, index) in description" :key="index" :part="part" /></span><template v-else>{{ description }}</template></span></span>
  </component>
</template>
