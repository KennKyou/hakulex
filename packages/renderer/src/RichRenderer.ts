import type { ColorScheme, EditorVariant, ThemeTokens } from '@hakulex/style-token'
import type { PropType } from 'vue'
import type { OnImageClick } from './image-click'
import type { LinkCardSettings } from './link-card-providers'
import type { PollAdapter, PollState } from './poll-adapter'
import type { Prerendered } from './prerender'
import type { RenderOptions } from './render'
import type { NodeRenderer, SerializedDocument } from './types'
import { CONTENT_CLASS, ROOT_CLASS, themeStyle } from '@hakulex/style-token'
import { computed, defineComponent, h, provide } from 'vue'
import { DynamicSettingsKey } from './dynamic'
import { EmbedThemeKey } from './embed'
import { createImageClickContext, ImageClickKey } from './image-click'
import { LinkCardSettingsKey } from './link-card-providers'
import { createPollContext, PollContextKey } from './poll-adapter'
import { PrerenderedKey } from './prerender'
import { renderDocument, toDocument } from './render'

/**
 * Read-only rendering of a hakulex / Lexical document. No Lexical runtime;
 * works in SSR. Uses the same class names and CSS as `<RichEditor>`.
 */
export const RichRenderer = defineComponent({
  name: 'RichRenderer',
  props: {
    /** Serialized editor state, as an object or a JSON string. */
    value: {
      type: [Object, String] as PropType<SerializedDocument | string | null>,
      default: null,
    },
    variant: { type: String as PropType<EditorVariant>, default: 'article' },
    colorScheme: { type: String as PropType<ColorScheme>, default: 'light' },
    /** The site's own tokens, such as `{ color: { accent: '#171717' } }`, on the root. */
    theme: { type: Object as PropType<ThemeTokens>, default: undefined },
    renderers: { type: Object as PropType<Record<string, NodeRenderer>>, default: undefined },
    headingIds: { type: Boolean, default: true },
    /** Tag of the root element. */
    as: { type: String, default: 'div' },
    /** Output of `prerenderDocument(value)`: typeset math and diagrams in SSR. */
    prerendered: { type: Object as PropType<Prerendered>, default: undefined },
    /** Where polls get their state and send votes. Without it, polls only show their options. */
    pollAdapter: { type: Object as PropType<PollAdapter>, default: undefined },
    /**
     * Poll states the server already loaded, by poll id (see `extractPolls`). Give the same
     * on server and client, so the first render has results and hydration matches.
     */
    polls: { type: Object as PropType<Record<string, PollState>>, default: undefined },
    /**
     * Whether a dynamic block may load its module from another origin. A module runs with the
     * page's rights, so without this only modules from the page's own origin load.
     */
    allowDynamicUrl: { type: Function as PropType<(url: string) => boolean>, default: undefined },
    /**
     * Link cards for addresses a source knows, such as GitHub's, fetch what they show in the
     * browser. Adds providers, routes their requests, or turns fetching off with `enabled: false`.
     */
    linkCards: { type: Object as PropType<LinkCardSettings>, default: undefined },
    /**
     * Called when a reader clicks an image, or presses Enter or Space on one, with the image,
     * its group and where it is in it: for the site's own lightbox. Without it images don't
     * respond. Also written `@image-click`.
     */
    onImageClick: { type: Function as PropType<OnImageClick>, default: undefined },
  },
  setup(props) {
    provide(PrerenderedKey, () => props.prerendered)
    provide(PollContextKey, createPollContext(() => props.pollAdapter, () => props.polls))
    provide(DynamicSettingsKey, () => ({ allow: props.allowDynamicUrl, theme: props.colorScheme }))
    provide(LinkCardSettingsKey, () => props.linkCards)
    provide(EmbedThemeKey, () => props.colorScheme)
    provide(ImageClickKey, createImageClickContext(() => props.onImageClick))
    const doc = computed(() => toDocument(props.value))
    const options = computed<RenderOptions>(() => ({ renderers: props.renderers, headingIds: props.headingIds }))

    // Only when there is something: SSR writes an empty style attribute for an undefined one.
    const themeVars = computed(() => themeStyle(props.theme))
    return () => h(props.as, {
      'class': [ROOT_CLASS, CONTENT_CLASS, 'hlx-renderer'],
      'data-variant': props.variant,
      'data-color-scheme': props.colorScheme,
      ...(Object.keys(themeVars.value).length
        ? { style: themeVars.value }
        : {}),
    }, doc.value
      ? renderDocument(doc.value, options.value)
      : [])
  },
})
