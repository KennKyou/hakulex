import type { BaseSelection } from 'lexical'
import type { PropType } from 'vue'
import type { ImageDialogEntry, ImageDialogMode } from '../image/dialog-model'
import type { ImagePreprocess } from '../image/editor-registry'
import type { ImageData, UploadImage } from '../image/types'
import type { SavedCaret } from '../media/insert'
import { useLexicalComposer, useLexicalEditable, useLexicalRegister } from '@hakulex/vue-lexical'
import { DRAG_DROP_PASTE } from '@lexical/rich-text'
import { mergeRegister } from '@lexical/utils'
import {
  $addUpdateTag,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $setSelection,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  HISTORY_PUSH_TAG,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  PASTE_COMMAND,
} from 'lexical'
import { defineComponent, h, inject, nextTick, onBeforeUnmount, shallowRef } from 'vue'
import ImageDialog from '../components/ImageDialog.vue'
import { EditorCoreKey } from '../editor-core-key'
import { isImageFile } from '../image/dialog-model'
import { resolvePreprocessTargets } from '../image/editor-registry'
import { uploadToImage } from '../image/upload'
import { $moveAroundBlock, $selectedBlock, $selectNode } from '../media/block-navigation'
import { registerDropZone } from '../media/drop-zone'
import { $insertBlock, $isRangeUsable, $liftBlock, $restoreCaret, $saveCaret } from '../media/insert'
import { blockPanelOf } from '../media/live-edit'
import {
  $createImageNode,
  $isImageNode,
  ImageNode,
  INSERT_IMAGE_COMMAND,
  OPEN_IMAGE_DIALOG_COMMAND,
} from '../nodes/ImageNode'

const $selectedImage = () => $selectedBlock($isImageNode)

function $insertImage(data: ImageData): void {
  $insertBlock($createImageNode(data))
}

/**
 * Handles image commands and renders the dialog. Needs `ImageNode`. An image
 * pasted inside a paragraph is lifted to the top level.
 */
export const ImagePlugin = defineComponent({
  name: 'ImagePlugin',
  props: {
    upload: { type: Function as PropType<UploadImage>, default: undefined },
  },
  setup(props) {
    const editor = useLexicalComposer()
    const core = inject(EditorCoreKey, null)
    const tools = core?.imageTools ?? null
    const open = shallowRef(false)
    const editable = useLexicalEditable()
    const uploading = shallowRef(0)
    const failed = shallowRef(0)
    let mounted = true
    onBeforeUnmount(() => {
      mounted = false
    })
    /** The list opened for files a plugin wants looked at. */
    interface Review {
      files: File[]
      mode: ImageDialogMode
      resolve: (files: File[] | null) => void
    }
    const review = shallowRef<Review | null>(null)
    function settleReview(files: File[] | null) {
      const current = review.value
      review.value = null
      current?.resolve(files)
    }
    // The outer editor opens it for the editors inside too.
    const openReview: ImagePreprocess = (files, { source }) => new Promise((resolve) => {
      settleReview(null)
      review.value = {
        files,
        mode: source === 'replace'
          ? 'replace'
          : 'insert',
        resolve,
      }
    })
    if (tools && !tools.review.value)
      tools.review.value = openReview
    onBeforeUnmount(() => {
      settleReview(null)
      if (tools?.review.value === openReview)
        tools.review.value = null
    })

    // The dialog takes focus; remember where to insert when it closes.
    let savedCaret: SavedCaret | null = null

    /**
     * Hands focus back once the dialog has unmounted. While it is mounted, its
     * focus trap pulls focus straight back from anything outside it.
     */
    async function backToEditor() {
      await nextTick()
      editor.getRootElement()?.focus({ preventScroll: true })
    }

    /** Inserts what the dialog's list holds, where the caret was when it opened. */
    async function onSubmit(entries: ImageDialogEntry[]) {
      open.value = false
      await backToEditor()
      let target: BaseSelection | null = null
      editor.update(() => {
        $restoreCaret(savedCaret)
        savedCaret = null
        target = $getSelection()?.clone() ?? null
      }, { discrete: true })
      const upload = props.upload
      void addImages(entries.flatMap((entry): Job[] => {
        // Already checked when it was chosen; nothing to upload.
        if (entry.kind === 'picked') {
          const { image } = entry
          return [
            {
              uploads: false,
              run: async () => image,
            },
          ]
        }
        if (entry.kind === 'url') {
          const { src, width, height } = entry
          return [
            {
              uploads: false,
              run: async () => ({ src, altText: '', width, height }),
            },
          ]
        }
        return upload
          ? [
              {
                uploads: true,
                run: () => uploadToImage(entry.file, upload),
              },
            ]
          : []
      }), target)
    }

    async function onCancel() {
      open.value = false
      await nextTick()
      const selection = savedCaret
      savedCaret = null
      editor.update(() => $restoreCaret(selection))
      // With a text caret, root.focus() would move it to the start of the document;
      // editor.focus() re-applies the selection instead.
      editor.focus()
    }

    interface Job {
      /** Whether this one is an upload, for the status the author sees. */
      uploads: boolean
      run: () => Promise<ImageData>
    }

    /** Gets everything first, then inserts what worked in one step, where it was asked for. */
    async function addImages(jobs: Job[], target: BaseSelection | null) {
      if (!jobs.length)
        return
      const uploads = jobs.filter(job => job.uploads).length
      uploading.value += uploads
      failed.value = 0
      const results = await Promise.allSettled(jobs.map(job => job.run()))
      if (!mounted)
        return
      uploading.value -= uploads
      // A read-only document stays as it is; the author hears about it once editable again.
      if (!editor.isEditable()) {
        failed.value += jobs.length
        return
      }
      const images = results.flatMap(result => result.status === 'fulfilled'
        ? [result.value]
        : [])
      failed.value += jobs.length - images.length
      if (!images.length)
        return
      editor.update(() => {
        $addUpdateTag(HISTORY_PUSH_TAG)
        const current = $getSelection()?.clone() ?? null
        const unmoved = !!current && !!target && current.is(target)
        if ($isRangeUsable(target))
          $setSelection(target!.clone())
        else
          $getRoot().selectEnd()
        images.forEach($insertImage)
        // The author kept working during the upload; don't pull the caret away.
        if (!unmoved && $isRangeUsable(current))
          $setSelection(current)
      })
    }

    function handleFiles(files: File[], source: 'paste' | 'drop'): boolean {
      const images = files.filter(isImageFile)
      if (!props.upload || !editor.isEditable() || !images.length)
        return false
      const upload = props.upload
      const target = $getSelection()?.clone() ?? null
      const insert = (chosen: File[]) => addImages(chosen.map(file => ({
        uploads: true,
        run: () => uploadToImage(file, upload),
      })), target)
      if (!tools?.preprocess.value) {
        void insert(images)
        return true
      }
      // A plugin looks at them first, such as the list of images to insert.
      void resolvePreprocessTargets(images, source, tools).then(async (chosen) => {
        if (!mounted || !chosen.length)
          return
        await backToEditor()
        await insert(chosen)
      })
      return true
    }

    useLexicalRegister(editor => mergeRegister(
      registerDropZone(editor, 'data-image-drop', () => !!props.upload && editor.isEditable()),

      // With plain text this is content that also has a preview image, as spreadsheets
      // copy; a browser's "copy image" only adds HTML. Lexical would treat the HTML
      // as text, so files have to be picked up here.
      editor.registerCommand(PASTE_COMMAND, (event) => {
        const clipboard = 'clipboardData' in event
          ? event.clipboardData
          : null
        if (!clipboard || clipboard.getData('text/plain') || !handleFiles([...clipboard.files], 'paste'))
          return false
        event.preventDefault()
        return true
      }, COMMAND_PRIORITY_HIGH),

      // Lexical moves the selection to the drop point before dispatching this.
      editor.registerCommand(DRAG_DROP_PASTE, files => handleFiles(files, 'drop'), COMMAND_PRIORITY_HIGH),

      editor.registerNodeTransform(ImageNode, $liftBlock),

      editor.registerCommand(OPEN_IMAGE_DIALOG_COMMAND, (payload) => {
        if (!editor.isEditable())
          return false
        const node = payload
          ? $getNodeByKey(payload.nodeKey)
          : null
        // An image in the document is edited in the panel beside it; the dialog only inserts.
        if ($isImageNode(node)) {
          $selectNode(node)
          blockPanelOf(editor).value = node.getKey()
          return true
        }
        savedCaret = $saveCaret()
        open.value = true
        return true
      }, COMMAND_PRIORITY_EDITOR),

      editor.registerCommand(INSERT_IMAGE_COMMAND, (data) => {
        $restoreCaret(savedCaret)
        savedCaret = null
        $insertImage(data)
        return true
      }, COMMAND_PRIORITY_EDITOR),

      editor.registerCommand(KEY_ENTER_COMMAND, (event) => {
        const image = $selectedImage()
        if (!image)
          return false
        event?.preventDefault()
        editor.dispatchCommand(OPEN_IMAGE_DIALOG_COMMAND, {
          nodeKey: image.getKey(),
        })
        return true
      }, COMMAND_PRIORITY_LOW),

      editor.registerCommand(KEY_ARROW_UP_COMMAND, event => $moveAroundBlock(editor, $isImageNode, 'up', event), COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_ARROW_DOWN_COMMAND, event => $moveAroundBlock(editor, $isImageNode, 'down', event), COMMAND_PRIORITY_LOW),
    ))

    const renderStatus = () => {
      if (uploading.value) {
        return h('div', { class: 'hlx-image-upload' }, [
          h('span', { role: 'status' }, `上傳 ${uploading.value} 張圖片中…`),
        ])
      }
      if (!failed.value || !editable.value)
        return null
      return h('div', { class: 'hlx-image-upload' }, [
        h('span', { role: 'alert' }, `有 ${failed.value} 張圖片沒有插入。`),
        h('button', {
          'type': 'button',
          'aria-label': '關閉訊息',
          'onClick': () => {
            failed.value = 0
          },
        }, '×'),
      ])
    }

    // The dialog is mounted only while open: a closed Reka portal would still leave
    // teleport anchors in <body> for every editor on the page.
    return () => [
      open.value
        ? h(ImageDialog, {
            canUpload: !!props.upload,
            allowUrl: core?.allowImageUrl() ?? true,
            pickImages: core?.pickImages() ?? null,
            pickLabel: core?.pickImagesLabel(),
            editor: tools?.editor.value ?? null,
            privacy: core?.imagePrivacy(),
            allowKeepOriginal: core?.allowKeepOriginal() ?? false,
            onSubmit,
            onCancel,
          })
        : null,
      review.value
        ? h(ImageDialog, {
            key: 'review',
            mode: review.value.mode,
            initialFiles: review.value.files,
            allowUrl: false,
            canUpload: true,
            editor: tools?.editor.value ?? null,
            privacy: core?.imagePrivacy(),
            allowKeepOriginal: core?.allowKeepOriginal() ?? false,
            onSubmit: (entries: ImageDialogEntry[]) => settleReview(entries.flatMap(entry => (entry.kind === 'file'
              ? [entry.file]
              : []))),
            onCancel: () => settleReview(null),
          })
        : null,
      renderStatus(),
    ]
  },
})
