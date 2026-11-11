import type { HistoryState } from '@lexical/history'
import type { Transformer } from '@lexical/markdown'
import type { PropType } from 'vue'
import type { ImageEditPrivacy, ImageTools } from './image/editor-registry'
import type { UploadImage } from './image/types'
import type { UploadFile, UploadVideo } from './media/types'
import type { EditorNode } from './nodes'
import { validateUrl } from '@hakulex/renderer'
import {
  CheckListPlugin,
  LinkPlugin,
  ListPlugin,
  MarkdownShortcutPlugin,
  RichTextPlugin,
  TabIndentationPlugin,
  useLexicalRegister,
} from '@hakulex/vue-lexical'
import { registerHistory } from '@lexical/history'
import { mergeRegister } from '@lexical/utils'
import { $setSelection, CAN_REDO_COMMAND, CAN_UNDO_COMMAND, HISTORIC_TAG } from 'lexical'
import { computed, defineComponent, h, inject } from 'vue'
import { EditorCoreKey } from './editor-core-key'
import { AnnotationPlugin } from './plugins/AnnotationPlugin'
import { AutoLinkPlugin } from './plugins/AutoLinkPlugin'
import { CalloutPlugin } from './plugins/CalloutPlugin'
import { ClickBelowPlugin } from './plugins/ClickBelowPlugin'
import { CodeBlockPlugin } from './plugins/CodeBlockPlugin'
import { ContentBlockPlugin } from './plugins/ContentBlockPlugin'
import { DynamicPlugin } from './plugins/DynamicPlugin'
import { EmbedPlugin } from './plugins/EmbedPlugin'
import { FootnotePlugin } from './plugins/FootnotePlugin'
import { HorizontalRulePlugin } from './plugins/HorizontalRulePlugin'
import { ImagePlugin } from './plugins/ImagePlugin'
import { InlineCodeExitPlugin } from './plugins/InlineCodeExitPlugin'
import { InlineSyntaxPlugin } from './plugins/InlineSyntaxPlugin'
import { LinkCardPlugin } from './plugins/LinkCardPlugin'
import { LinkFaviconPlugin } from './plugins/LinkFaviconPlugin'
import { MarkdownPastePlugin } from './plugins/MarkdownPastePlugin'
import { MathPlugin } from './plugins/MathPlugin'
import { MediaPlugin } from './plugins/MediaPlugin'
import { MermaidPlugin } from './plugins/MermaidPlugin'
import { NestedBlockPlugin } from './plugins/NestedBlockPlugin'
import { QuotePlugin } from './plugins/QuotePlugin'
import { StepsPlugin } from './plugins/StepsPlugin'
import { TablePlugin } from './plugins/TablePlugin'
import { UnknownNodePlugin } from './plugins/UnknownNodePlugin'
import { builtinTransformers } from './transformers'
import { registeredTypes } from './unknown/document'

/** What the outer editor and the editors inside it have in common. */
export interface EditorCoreConfig {
  history: HistoryState
  uploadImage: () => UploadImage | undefined
  /** What plugins add to how images are added: an editor, and a step before uploads. */
  imageTools: ImageTools
  /** The site's way to find and remove a photo's location; see `<RichEditor>`. */
  imagePrivacy: () => ImageEditPrivacy | undefined
  /** Whether the image list offers to upload the original; see `<RichEditor>`. */
  allowKeepOriginal: () => boolean
  uploadVideo: () => UploadVideo | undefined
  uploadFile: () => UploadFile | undefined
  /** Whether a dynamic block may load a module from another origin; see `<RichEditor>`. */
  allowDynamicUrl: () => ((url: string) => boolean) | undefined
  /** What the `nested` slot of `<RichEditor>` renders, inside each editor in the document. */
  nested: () => unknown
}

export { EditorCoreKey }

const HISTORY_DELAY = 300

/** What the outer editor was last told, so that a caret moving in a step doesn't bother it. */
const announced = new WeakMap<HistoryState, { canUndo: boolean, canRedo: boolean }>()

/**
 * One history for an editor and the editors inside it, so undo goes through what happened in
 * order, wherever it happened. Whatever shows if undo is possible looks at the outer editor.
 */
const SharedHistoryPlugin = defineComponent({
  name: 'SharedHistoryPlugin',
  props: {
    history: { type: Object as PropType<HistoryState>, required: true },
  },
  setup(props) {
    useLexicalRegister((editor) => {
      const outer = editor._parentEditor
      const notifyOuter = (state: HistoryState) => {
        const canUndo = state.undoStack.length > 0
        const canRedo = state.redoStack.length > 0
        const known = announced.get(state)
        if (known?.canUndo === canUndo && known.canRedo === canRedo)
          return
        announced.set(state, { canUndo, canRedo })
        // The outer editor hears about its own changes from Lexical.
        if (!outer)
          return
        const selection = outer.getEditorState()._selection?.clone() ?? null
        outer.update(() => {
          // During a selectionchange, an update reads the selection from the DOM, and that's in
          // this editor: the outer one would take it, and pull the caret out of the step.
          $setSelection(selection)
          if (selection)
            selection.dirty = false
          outer.dispatchCommand(CAN_UNDO_COMMAND, canUndo)
          outer.dispatchCommand(CAN_REDO_COMMAND, canRedo)
        }, { discrete: true })
      }
      return mergeRegister(
        registerHistory(editor, props.history, HISTORY_DELAY, Date.now, notifyOuter),
        // The change undo brings back may be in another editor. Focus goes along.
        editor.registerUpdateListener(({ tags }) => {
          const root = editor.getRootElement()
          if (tags.has(HISTORIC_TAG) && root && !root.contains(root.ownerDocument.activeElement))
            root.focus({ preventScroll: true })
        }),
      )
    })
    return () => null
  },
})

/** Transformers need their nodes, and an editor inside another one doesn't have them all. */
function transformersFor(nodes: EditorNode[]): Transformer[] {
  const registered = registeredTypes(nodes)
  return builtinTransformers.filter(transformer => !('dependencies' in transformer)
    || transformer.dependencies.every(dependency => registered.has(dependency.getType())))
}

/** The plugins every editing surface has: the outer editor, and each editor inside it. */
export const EditorCorePlugins = defineComponent({
  name: 'EditorCorePlugins',
  props: {
    nodes: { type: Array as PropType<EditorNode[]>, required: true },
    /** Inside another editor, which has the footnotes for the whole document. */
    nested: { type: Boolean, default: false },
  },
  setup(props) {
    const core = inject(EditorCoreKey)!
    const transformers = computed(() => transformersFor(props.nodes))
    return () => [
      h(RichTextPlugin),
      h(SharedHistoryPlugin, { history: core.history }),
      h(ListPlugin),
      h(CheckListPlugin),
      h(LinkPlugin, { validateUrl }),
      h(AutoLinkPlugin),
      h(MarkdownPastePlugin, { nodes: props.nodes }),
      h(ClickBelowPlugin),
      h(InlineCodeExitPlugin),
      h(TabIndentationPlugin, { maxIndent: 7 }),
      h(HorizontalRulePlugin),
      h(CodeBlockPlugin),
      h(MathPlugin),
      h(MermaidPlugin),
      h(ImagePlugin, {
        upload: core.uploadImage(),
      }),
      h(MediaPlugin, {
        uploadVideo: core.uploadVideo(),
        uploadFile: core.uploadFile(),
        imageUpload: !!core.uploadImage(),
      }),
      h(EmbedPlugin),
      h(LinkCardPlugin),
      h(LinkFaviconPlugin),
      h(DynamicPlugin),
      h(ContentBlockPlugin),
      props.nested
        ? null
        : h(StepsPlugin),
      props.nested
        ? null
        : h(NestedBlockPlugin),
      h(TablePlugin),
      h(CalloutPlugin),
      h(InlineSyntaxPlugin),
      props.nested
        ? null
        : h(FootnotePlugin),
      h(UnknownNodePlugin),
      h(QuotePlugin),
      h(AnnotationPlugin),
      h(MarkdownShortcutPlugin, { transformers: transformers.value }),
    ]
  },
})
