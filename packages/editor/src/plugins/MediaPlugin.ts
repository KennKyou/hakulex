import type { LexicalNode } from 'lexical'
import type { PropType } from 'vue'
import type { SavedCaret } from '../media/insert'
import type { FileData, UploadFile, UploadVideo, VideoData } from '../media/types'
import type { MediaKind } from '../nodes/MediaNodes'
import { useLexicalComposer, useLexicalEditable, useLexicalRegister } from '@hakulex/vue-lexical'
import { DRAG_DROP_PASTE } from '@lexical/rich-text'
import { mergeRegister } from '@lexical/utils'
import {
  $addUpdateTag,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $setSelection,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  HISTORY_PUSH_TAG,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  PASTE_COMMAND,
} from 'lexical'
import { defineComponent, h, nextTick, onBeforeUnmount, shallowRef } from 'vue'
import MediaDialog from '../components/MediaDialog.vue'
import { $moveAroundBlock, $selectedBlock, $selectNode } from '../media/block-navigation'
import { registerDropZone } from '../media/drop-zone'
import { $insertBlock, $isRangeUsable, $liftBlock, $restoreCaret, $saveCaret } from '../media/insert'
import { blockPanelOf } from '../media/live-edit'
import { uploadToFile, uploadToVideo } from '../media/upload'
import {
  $createFileNode,
  $createVideoNode,
  $isMediaBlock,
  $isMediaNode,
  $isVideoNode,
  FileNode,
  INSERT_FILE_COMMAND,
  INSERT_VIDEO_COMMAND,
  OPEN_MEDIA_DIALOG_COMMAND,
  VideoNode,
} from '../nodes/MediaNodes'

/**
 * Handles video and file commands, renders their dialog, and takes dropped or pasted
 * files. Images are left to ImagePlugin when `imageUpload` says it can take them.
 */
export const MediaPlugin = defineComponent({
  name: 'MediaPlugin',
  props: {
    uploadVideo: { type: Function as PropType<UploadVideo>, default: undefined },
    uploadFile: { type: Function as PropType<UploadFile>, default: undefined },
    imageUpload: { type: Boolean, default: false },
  },
  setup(props) {
    const editor = useLexicalComposer()
    const editable = useLexicalEditable()
    const dialog = shallowRef<{ kind: MediaKind } | null>(null)
    const uploading = shallowRef(0)
    const failed = shallowRef(0)
    let mounted = true
    onBeforeUnmount(() => {
      mounted = false
    })
    // The dialog takes focus; remember where to insert when it closes.
    let savedCaret: SavedCaret | null = null

    // What was open, once the dialog is gone: it closes right before reporting why.
    let closing: typeof dialog.value = null

    async function onSubmit(data: VideoData | FileData) {
      const current = closing
      // Once the dialog has unmounted: while mounted, its focus trap pulls focus straight back.
      await nextTick()
      editor.getRootElement()?.focus({ preventScroll: true })
      // It may have gone read-only during an upload, and those documents don't change.
      if (!current || !editor.isEditable())
        return
      if (current.kind === 'video')
        editor.dispatchCommand(INSERT_VIDEO_COMMAND, data as VideoData)
      else
        editor.dispatchCommand(INSERT_FILE_COMMAND, data as FileData)
    }

    async function onCancel() {
      await nextTick()
      const selection = savedCaret
      savedCaret = null
      editor.update(() => $restoreCaret(selection))
      editor.focus()
    }

    type Job = () => Promise<() => LexicalNode>

    /** The job for a file, or null when nothing here can take it. */
    function jobFor(file: File): Job | null {
      if (file.type.startsWith('image/') && props.imageUpload)
        return null
      if (file.type.startsWith('video/') && props.uploadVideo) {
        const upload = props.uploadVideo
        return async () => {
          const data = await uploadToVideo(file, upload)
          return () => $createVideoNode(data)
        }
      }
      if (props.uploadFile) {
        const upload = props.uploadFile
        return async () => {
          const data = await uploadToFile(file, upload)
          return () => $createFileNode(data)
        }
      }
      return null
    }

    /** Uploads everything first, then inserts what worked in one step, where it was asked for. */
    async function run(jobs: Job[]) {
      const target = $getSelection()?.clone() ?? null
      uploading.value += jobs.length
      failed.value = 0
      const results = await Promise.allSettled(jobs.map(job => job()))
      if (!mounted)
        return
      uploading.value -= jobs.length
      if (!editor.isEditable()) {
        failed.value += jobs.length
        return
      }
      const created = results.flatMap(result => result.status === 'fulfilled'
        ? [result.value]
        : [])
      failed.value += jobs.length - created.length
      if (!created.length)
        return
      editor.update(() => {
        $addUpdateTag(HISTORY_PUSH_TAG)
        const current = $getSelection()?.clone() ?? null
        const unmoved = !!current && !!target && current.is(target)
        if ($isRangeUsable(target))
          $setSelection(target!.clone())
        else
          $getRoot().selectEnd()
        for (const create of created) {
          $insertBlock(create())
        }
        // The author kept working during the upload; don't pull the caret away.
        if (!unmoved && $isRangeUsable(current))
          $setSelection(current)
      })
    }

    /** Takes what it can. False leaves the rest, which can only be images, to ImagePlugin. */
    function handleFiles(files: File[]): boolean {
      if (!editor.isEditable())
        return false
      const jobs = files.map(jobFor)
      const mine = jobs.filter(job => job !== null)
      if (!mine.length)
        return false
      void run(mine)
      return !files.some(file => file.type.startsWith('image/') && props.imageUpload)
    }

    useLexicalRegister(editor => mergeRegister(
      registerDropZone(editor, 'data-media-drop', () => (!!props.uploadVideo || !!props.uploadFile) && editor.isEditable()),

      // With plain text this is content that also has a preview, as spreadsheets copy.
      editor.registerCommand(PASTE_COMMAND, (event) => {
        const clipboard = 'clipboardData' in event
          ? event.clipboardData
          : null
        if (!clipboard || clipboard.getData('text/plain') || !clipboard.files.length)
          return false
        if (!handleFiles([...clipboard.files]))
          return false
        event.preventDefault()
        return true
      }, COMMAND_PRIORITY_CRITICAL),

      // Lexical moves the selection to the drop point before dispatching this.
      editor.registerCommand(DRAG_DROP_PASTE, files => handleFiles(files), COMMAND_PRIORITY_CRITICAL),

      editor.registerNodeTransform(VideoNode, $liftBlock),
      editor.registerNodeTransform(FileNode, (node) => {
        if (!node.isInline())
          $liftBlock(node)
      }),

      editor.registerCommand(OPEN_MEDIA_DIALOG_COMMAND, ({ kind, nodeKey }) => {
        if (!editor.isEditable())
          return false
        const node = nodeKey
          ? $getNodeByKey(nodeKey)
          : null
        // One in the document is edited in the panel beside it; the dialog only adds.
        if ($isMediaNode(node)) {
          $selectNode(node)
          blockPanelOf(editor).value = node.getKey()
          return true
        }
        dialog.value = { kind }
        savedCaret = $saveCaret()
        return true
      }, COMMAND_PRIORITY_EDITOR),

      editor.registerCommand(INSERT_VIDEO_COMMAND, (data) => {
        $addUpdateTag(HISTORY_PUSH_TAG)
        $restoreCaret(savedCaret)
        savedCaret = null
        $insertBlock($createVideoNode(data))
        return true
      }, COMMAND_PRIORITY_EDITOR),

      editor.registerCommand(INSERT_FILE_COMMAND, (data) => {
        $addUpdateTag(HISTORY_PUSH_TAG)
        $restoreCaret(savedCaret)
        savedCaret = null
        $insertBlock($createFileNode({ ...data, display: 'block' }))
        return true
      }, COMMAND_PRIORITY_EDITOR),

      editor.registerCommand(KEY_ENTER_COMMAND, (event) => {
        const node = $selectedBlock($isMediaNode)
        if (!node)
          return false
        event?.preventDefault()
        editor.dispatchCommand(OPEN_MEDIA_DIALOG_COMMAND, {
          kind: $isVideoNode(node)
            ? 'video'
            : 'file',
          nodeKey: node.getKey(),
        })
        return true
      }, COMMAND_PRIORITY_LOW),

      editor.registerCommand(KEY_ARROW_UP_COMMAND, event => $moveAroundBlock(editor, $isMediaBlock, 'up', event), COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_ARROW_DOWN_COMMAND, event => $moveAroundBlock(editor, $isMediaBlock, 'down', event), COMMAND_PRIORITY_LOW),
    ))

    const renderStatus = () => {
      if (uploading.value) {
        return h('div', { class: 'hlx-media-upload' }, [
          h('span', { role: 'status' }, `上傳 ${uploading.value} 個檔案中…`),
        ])
      }
      if (!failed.value || !editable.value)
        return null
      return h('div', { class: 'hlx-media-upload' }, [
        h('span', { role: 'alert' }, `有 ${failed.value} 個檔案沒有插入。`),
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
      dialog.value
        ? h(MediaDialog, {
            'open': true,
            'onUpdate:open': (value: boolean) => {
              if (!value) {
                closing = dialog.value
                dialog.value = null
              }
            },
            'kind': dialog.value.kind,
            'upload': dialog.value.kind === 'video'
              ? props.uploadVideo
              : props.uploadFile,
            'onSubmit': onSubmit,
            'onCancel': onCancel,
          })
        : null,
      renderStatus(),
    ]
  },
})
