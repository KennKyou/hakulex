<script setup lang="ts">
import type { LinkCardSettings } from '@hakulex/renderer'
import type { ColorScheme, EditorVariant, ThemeTokens } from '@hakulex/style-token'
import type { InitialConfig } from '@hakulex/vue-lexical'
import type { EditorState, LexicalEditor, SerializedEditorState } from 'lexical'
import type { ImageEditPrivacy } from './image/editor-registry'
import type { UploadImage } from './image/types'
import type { UploadFile, UploadVideo } from './media/types'
import type { EditorNode } from './nodes'
import { LinkCardSettingsKey } from '@hakulex/renderer'
import { ROOT_CLASS, themeStyle } from '@hakulex/style-token'
import { ContentEditable, LexicalComposer } from '@hakulex/vue-lexical'
import { createEmptyHistoryState } from '@lexical/history'
import { computed, provide, shallowRef } from 'vue'
import { EditorCoreKey, EditorCorePlugins } from './EditorCorePlugins'
import { EditorModelPlugin } from './EditorModelPlugin'
import { createImageTools } from './image/editor-registry'
import { builtinNodes } from './nodes'
import { editorTheme } from './theme'
import { provideEditorTheme } from './theme-context'
import { registeredTypes, wrapUnknownNodes } from './unknown/document'

const props = withDefaults(defineProps<{
  variant?: EditorVariant
  colorScheme?: ColorScheme
  /**
   * The site's own tokens, such as `{ color: { accent: '#171717' } }`: on the editor and on
   * everything it shows over the page. Give another object for dark mode.
   */
  theme?: ThemeTokens
  editable?: boolean
  placeholder?: string
  /** Lexical namespace; also used to tell editors apart in copy / paste. */
  namespace?: string
  /** Extra nodes on top of `builtinNodes`. Read once at mount. */
  nodes?: EditorNode[]
  /** Stores a chosen image file. Without it, images can only be inserted by URL. */
  uploadImage?: UploadImage
  /**
   * Finds and removes a photo's location. With it, the list of images to insert offers to
   * remove the location before uploading.
   */
  imagePrivacy?: ImageEditPrivacy
  /**
   * Lets the author ask for the original file in the list of images to insert: `uploadImage`
   * then gets `{ keepOriginal: true }`, to skip compressing it.
   */
  allowKeepOriginal?: boolean
  /** Stores a chosen video. Without it, videos can only be added by URL. */
  uploadVideo?: UploadVideo
  /** Stores a chosen file. Also takes dropped videos and images nothing else can. */
  uploadFile?: UploadFile
  /**
   * Whether a dynamic block may load its module from another origin. A module runs with the
   * page's rights, so without this only modules from the page's own origin load.
   */
  allowDynamicUrl?: (url: string) => boolean
  /**
   * Link cards for addresses a source knows, such as GitHub's, fetch what they show. Adds
   * providers, routes their requests, or turns fetching off with `enabled: false`.
   */
  linkCards?: LinkCardSettings
}>(), {
  variant: 'article',
  colorScheme: 'light',
  editable: true,
  placeholder: undefined,
  namespace: 'hakulex',
  nodes: () => [],
  uploadImage: undefined,
  imagePrivacy: undefined,
  allowKeepOriginal: false,
  uploadVideo: undefined,
  uploadFile: undefined,
  allowDynamicUrl: undefined,
  linkCards: undefined,
})

const emit = defineEmits<{
  change: [state: EditorState, editor: LexicalEditor]
}>()

const slots = defineSlots<{
  /** Extra plugins; rendered inside the composer so they can use `useLexicalComposer()`. */
  default?: () => unknown
  /** A fixed toolbar: comes before the content, so Tab reaches it in the order it's seen. */
  toolbar?: () => unknown
  /** Plugins for the editors inside the document, such as a step's. Rendered once for each. */
  nested?: () => unknown
}>()

/** Serialized Lexical JSON. `null` clears the document. */
const model = defineModel<SerializedEditorState | null>()

const themeVars = computed(() => themeStyle(props.theme))
provideEditorTheme(() => ({ variant: props.variant, colorScheme: props.colorScheme, style: themeVars.value }))
// Read by every card, in nested content too.
provide(LinkCardSettingsKey, () => props.linkCards)
provide(EditorCoreKey, {
  history: createEmptyHistoryState(),
  uploadImage: () => props.uploadImage,
  imageTools: createImageTools(),
  imagePrivacy: () => props.imagePrivacy,
  allowKeepOriginal: () => props.allowKeepOriginal,
  uploadVideo: () => props.uploadVideo,
  uploadFile: () => props.uploadFile,
  allowDynamicUrl: () => props.allowDynamicUrl,
  nested: () => slots.nested?.(),
})

const editor = shallowRef<LexicalEditor>()
defineExpose({ editor })

const nodes: EditorNode[] = [
  ...builtinNodes,
  ...props.nodes,
]
const registered = registeredTypes(nodes)

const initialConfig: InitialConfig = {
  namespace: props.namespace,
  theme: editorTheme,
  nodes,
  editable: props.editable,
  editorState: model.value
    ? JSON.stringify(wrapUnknownNodes(model.value, registered))
    : undefined,
}
</script>

<template>
  <div
    class="hlx-editor" :class="[ROOT_CLASS]"
    :data-variant="variant"
    :data-color-scheme="colorScheme"
    :style="themeVars"
  >
    <LexicalComposer :initial-config="initialConfig">
      <slot name="toolbar" />
      <!-- The document's own box: the placeholder is placed inside it, so under any toolbar. -->
      <div class="hlx-editor-body">
        <ContentEditable class="hlx-content" :placeholder="placeholder" />
      </div>
      <EditorCorePlugins :nodes="nodes" />
      <EditorModelPlugin
        v-model="model"
        :editable="editable"
        :registered="registered"
        @ready="editor = $event"
        @change="(state, ed) => emit('change', state, ed)"
      />
      <slot />
    </LexicalComposer>
  </div>
</template>
