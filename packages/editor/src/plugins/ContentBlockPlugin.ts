import type { LexicalCommand, LexicalEditor, LexicalNode, NodeKey } from 'lexical'
import type { Component, Ref, ShallowRef } from 'vue'
import type { BlockToolbarAction } from '../components/BlockToolbar.vue'
import type { SavedCaret } from '../media/insert'
import { useLexicalComposer, useLexicalEditable, useLexicalNodeSelection, useLexicalRegister } from '@hakulex/vue-lexical'
import { $dfs, mergeRegister } from '@lexical/utils'
import {
  $addUpdateTag,
  $getEditor,
  $getNodeByKey,
  $hasUpdateTag,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  createCommand,
  HISTORY_MERGE_TAG,
  HISTORY_PUSH_TAG,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
} from 'lexical'
import { computed, defineComponent, h, nextTick, shallowRef } from 'vue'
import ChatDialog from '../components/ChatDialog.vue'
import CodeSnippetDialog from '../components/CodeSnippetDialog.vue'
import GalleryDialog from '../components/GalleryDialog.vue'
import LinkCardDialog from '../components/LinkCardDialog.vue'
import { $moveAroundBlock, $selectedBlock, $selectNode } from '../media/block-navigation'
import { useBlockFloating } from '../media/floating'
import { $insertBlock, $liftBlock, $restoreCaret, $saveCaret } from '../media/insert'
import { blockPanelOf, IconEdit } from '../media/live-edit'
import { $createChartNode, $isChartNode, ChartNode } from '../nodes/ChartNode'
import { $createChatNode, $isChatNode, ChatNode } from '../nodes/ChatNode'
import { $createCodeSnippetNode, $isCodeSnippetNode, CodeSnippetNode } from '../nodes/CodeSnippetNode'
import { $createGalleryNode, $isGalleryNode, GalleryNode } from '../nodes/GalleryNode'
import { $createLinkCardNode, $isLinkCardNode, LinkCardNode } from '../nodes/LinkCardNode'
import { $createPollNode, $isPollNode, createPollId, PollNode } from '../nodes/PollNode'

export type ContentBlockType = 'code-snippet' | 'gallery' | 'chat' | 'link-card' | 'poll' | 'chart'

/** What a block's dialog works on: the fields of the node, as stored. */
export type BlockFields = Record<string, unknown>

/**
 * Starts editing a block of this type: with `nodeKey`, that one in the document; without, a new one.
 * Code snippets, galleries and chats open their dialog either way. A link card or poll in the
 * document opens its panel beside it, and a new link card opens the dialog. A new poll or chart
 * goes straight in as an example, with its panel open.
 */
export const OPEN_BLOCK_DIALOG_COMMAND: LexicalCommand<{ type: ContentBlockType, nodeKey?: NodeKey }> = createCommand('OPEN_BLOCK_DIALOG_COMMAND')

interface ContentBlock {
  /** None for a chart and a poll: each goes straight in, with its panel open beside it. */
  dialog?: Component
  $create: (fields: BlockFields) => LexicalNode
  $read: (node: LexicalNode | null) => BlockFields | null
  $write: (node: LexicalNode, fields: BlockFields) => void
}

const BLOCKS: Record<ContentBlockType, ContentBlock> = {
  'code-snippet': {
    dialog: CodeSnippetDialog,
    $create: fields => $createCodeSnippetNode(fields.files as unknown[]),
    $read: node => ($isCodeSnippetNode(node)
      ? {
          files: node.getFiles(),
        }
      : null),
    $write: (node, fields) => (node as CodeSnippetNode).setFiles(fields.files as unknown[]),
  },
  'gallery': {
    dialog: GalleryDialog,
    $create: fields => $createGalleryNode(fields).setFields(fields),
    $read: node => ($isGalleryNode(node)
      ? node.getFields()
      : null),
    $write: (node, fields) => (node as GalleryNode).setFields(fields),
  },
  'chat': {
    dialog: ChatDialog,
    $create: fields => $createChatNode(fields),
    $read: node => ($isChatNode(node)
      ? node.getFields()
      : null),
    $write: (node, fields) => (node as ChatNode).setFields(fields),
  },
  'link-card': {
    dialog: LinkCardDialog,
    $create: fields => $createLinkCardNode({}).setFields(fields),
    $read: node => ($isLinkCardNode(node)
      ? node.getFields()
      : null),
    $write: (node, fields) => (node as LinkCardNode).setFields(fields),
  },
  'poll': {
    $create: fields => $createPollNode({}).setFields(fields),
    $read: node => ($isPollNode(node)
      ? node.getFields()
      : null),
    $write: (node, fields) => (node as PollNode).setFields(fields),
  },
  'chart': {
    $create: fields => $createChartNode(fields),
    $read: node => ($isChartNode(node)
      ? node.getFields()
      : null),
    $write: (node, fields) => (node as ChartNode).setFields(fields),
  },
}

/** Blocks edited in the panel beside them: their dialog only adds one. */
const PANEL_BLOCKS: ReadonlySet<ContentBlockType> = new Set(['link-card', 'poll'])

/** What a new chart starts as: something to change, rather than an empty form. */
export const EXAMPLE_CHART_SPEC = {
  version: 1,
  type: 'bar',
  title: '標題',
  x: 'month',
  series: [
    { key: 'a', label: '甲' },
    { key: 'b', label: '乙' },
  ],
  data: [
    { month: '一月', a: 12, b: 8 },
    { month: '二月', a: 18, b: 11 },
    { month: '三月', a: 15, b: 16 },
  ],
}

/** What a new poll starts as: a question and two options to change. */
function examplePoll(): BlockFields {
  return {
    pollId: createPollId('p'),
    question: '你比較喜歡哪一個？',
    options: [
      {
        id: createPollId('o'),
        label: '選項 1',
      },
      {
        id: createPollId('o'),
        label: '選項 2',
      },
    ],
    mode: 'single',
  }
}

const freshBlocks = new WeakMap<LexicalEditor, Set<NodeKey>>()
/** Whether the block was added in this editor just now, so nobody has voted on it yet. */
export function isFreshBlock(editor: LexicalEditor, key: NodeKey): boolean {
  return freshBlocks.get(editor)?.has(key) ?? false
}

/** Which chart has a panel open beside it, and which one: the form, or the raw spec. */
export interface ChartPanelState { key: NodeKey, kind: 'form' | 'raw' }
const chartPanels = new WeakMap<LexicalEditor, ShallowRef<ChartPanelState | null>>()
/** One per editor: the plugin opens panels, the chart's own component shows them. */
export function chartPanelOf(editor: LexicalEditor) {
  let state = chartPanels.get(editor)
  if (!state) {
    state = shallowRef<ChartPanelState | null>(null)
    chartPanels.set(editor, state)
  }
  return state
}

/**
 * Votes are kept by `pollId`, so a copy pasted into the same document gets its own. Only
 * polls an edit adds are checked: a stored document stays as it is, and one cut and pasted
 * back is the same poll.
 */
function $ownPollId(node: PollNode) {
  if ($hasUpdateTag(HISTORY_MERGE_TAG) || $getEditor().getEditorState()._nodeMap.has(node.getKey()))
    return
  const id = node.getFields().pollId
  if (typeof id !== 'string' || !id)
    return
  const taken = $dfs().some(({ node: other }) => $isPollNode(other) && !other.is(node) && other.getFields().pollId === id)
  if (taken) {
    node.setFields({
      pollId: createPollId('p'),
    })
  }
}

const $isContentBlock = (node: LexicalNode): node is CodeSnippetNode | GalleryNode | ChatNode | LinkCardNode | PollNode | ChartNode => $isCodeSnippetNode(node) || $isGalleryNode(node) || $isChatNode(node) || $isLinkCardNode(node) || $isPollNode(node) || $isChartNode(node)
const blockTypeOf = (node: LexicalNode) => node.getType() as ContentBlockType

/** Opens dialogs, and takes the keyboard to and from these blocks. */
export const ContentBlockPlugin = defineComponent({
  name: 'ContentBlockPlugin',
  setup() {
    const editor = useLexicalComposer()
    const dialog = shallowRef<{ type: ContentBlockType, key?: NodeKey, fields?: BlockFields } | null>(null)
    // The dialog takes focus; remember where to insert when it closes.
    let savedCaret: SavedCaret | null = null

    async function close() {
      dialog.value = null
      // Once the dialog has unmounted: while mounted, its focus trap pulls focus straight back.
      await nextTick()
      editor.getRootElement()?.focus({ preventScroll: true })
    }

    async function onSave(fields: BlockFields, unchanged: boolean) {
      const current = dialog.value
      if (!current)
        return
      await close()
      editor.update(() => {
        const block = BLOCKS[current.type]
        const node = current.key
          ? $getNodeByKey(current.key)
          : null
        if (node) {
          if (!unchanged) {
            $addUpdateTag(HISTORY_PUSH_TAG)
            block.$write(node, fields)
          }
          $selectNode(node)
          return
        }
        $addUpdateTag(HISTORY_PUSH_TAG)
        $restoreCaret(savedCaret)
        savedCaret = null
        $insertBlock(block.$create(fields))
      })
    }

    async function onCancel() {
      const current = dialog.value
      await close()
      editor.update(() => {
        const node = current?.key
          ? $getNodeByKey(current.key)
          : null
        if (node)
          $selectNode(node)
        else
          $restoreCaret(savedCaret)
        savedCaret = null
      })
    }

    useLexicalRegister(editor => mergeRegister(
      editor.registerNodeTransform(CodeSnippetNode, $liftBlock),
      editor.registerNodeTransform(GalleryNode, $liftBlock),
      editor.registerNodeTransform(ChatNode, $liftBlock),
      editor.registerNodeTransform(LinkCardNode, $liftBlock),
      editor.registerNodeTransform(ChartNode, $liftBlock),
      editor.registerNodeTransform(PollNode, (node) => {
        $ownPollId(node)
        $liftBlock(node)
      }),

      editor.registerCommand(OPEN_BLOCK_DIALOG_COMMAND, ({ type, nodeKey }) => {
        if (!editor.isEditable())
          return false
        const node = nodeKey
          ? $getNodeByKey(nodeKey)
          : null
        // A chart is edited in place: a new one goes straight in, picked, with its panel open.
        if (type === 'chart') {
          let chart = node
          if (!$isChartNode(chart)) {
            $addUpdateTag(HISTORY_PUSH_TAG)
            chart = $createChartNode({
              spec: JSON.stringify(EXAMPLE_CHART_SPEC, null, 2),
            })
            $insertBlock(chart)
          }
          $selectNode(chart)
          chartPanelOf(editor).value = {
            key: chart.getKey(),
            kind: 'form',
          }
          return true
        }
        // A poll goes straight in as an example, picked, with its panel open.
        if (type === 'poll' && !$isPollNode(node)) {
          $addUpdateTag(HISTORY_PUSH_TAG)
          const poll = $createPollNode({}).setFields(examplePoll())
          $insertBlock(poll)
          $selectNode(poll)
          if (!freshBlocks.has(editor))
            freshBlocks.set(editor, new Set())
          freshBlocks.get(editor)!.add(poll.getKey())
          blockPanelOf(editor).value = poll.getKey()
          return true
        }
        const fields = BLOCKS[type].$read(node)
        // These are edited in a panel beside them; their dialog only adds a new one.
        if (fields && node && PANEL_BLOCKS.has(type)) {
          $selectNode(node)
          blockPanelOf(editor).value = node.getKey()
          return true
        }
        dialog.value = {
          type,
          key: fields ? nodeKey : undefined,
          fields: fields ?? undefined,
        }
        savedCaret = $saveCaret()
        return true
      }, COMMAND_PRIORITY_EDITOR),

      editor.registerCommand(KEY_ENTER_COMMAND, (event) => {
        const node = $selectedBlock($isContentBlock)
        if (!node)
          return false
        event?.preventDefault()
        editor.dispatchCommand(OPEN_BLOCK_DIALOG_COMMAND, {
          type: blockTypeOf(node),
          nodeKey: node.getKey(),
        })
        return true
      }, COMMAND_PRIORITY_LOW),

      editor.registerCommand(KEY_ARROW_UP_COMMAND, event => $moveAroundBlock(editor, $isContentBlock, 'up', event), COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_ARROW_DOWN_COMMAND, event => $moveAroundBlock(editor, $isContentBlock, 'down', event), COMMAND_PRIORITY_LOW),
    ))

    // Mounted only while open: a closed Reka portal would still leave anchors in <body>.
    return () => (dialog.value && BLOCKS[dialog.value.type].dialog
      ? h(BLOCKS[dialog.value.type].dialog!, {
          key: dialog.value.key ?? 'new',
          initial: dialog.value.fields,
          onSave,
          onCancel,
        })
      : null)
  },
})

/** A pencil, for the 編輯 on a block's toolbar. */
export { IconEdit }

/**
 * A block's toolbar: shown while the block is picked in an editable editor, at its top right,
 * with whatever it offers; and a double click that does what its 編輯 does. The element is the
 * block's, for placing the toolbar; `edit` opens its editing.
 */
export function useBlockToolbar(
  element: Ref<HTMLElement | null>,
  selected: Ref<boolean>,
  editable: Ref<boolean>,
  edit: () => void,
) {
  const editor = useLexicalComposer()
  const showToolbar = computed(() => editable.value && selected.value)
  const { toolbarStyle } = useBlockFloating(editor, element, showToolbar)
  return {
    showToolbar,
    toolbarStyle,
    editAction: {
      id: 'edit',
      label: '編輯',
      icon: IconEdit,
      onSelect: edit,
    } satisfies BlockToolbarAction,
    onDblclick(event: MouseEvent) {
      // Tabs, links and buttons are for what they say.
      if (!editable.value || (event.target as Element).closest('button, a, input'))
        return
      event.preventDefault()
      edit()
    },
  }
}

/** What every one of these blocks does on the page: a click picks it, a button edits it. */
export function useContentBlock(nodeKey: NodeKey, type: ContentBlockType) {
  const editor = useLexicalComposer()
  const editable = useLexicalEditable()
  const { isSelected, setSelected, clearSelection } = useLexicalNodeSelection(nodeKey)
  return {
    editable,
    selected: computed(() => editable.value && isSelected.value),
    edit: () => editor.dispatchCommand(OPEN_BLOCK_DIALOG_COMMAND, { type, nodeKey }),
    onClick(event: MouseEvent) {
      // Tabs, links and buttons are for what they say.
      if (!editable.value || (event.target as Element).closest('button, a'))
        return
      clearSelection()
      setSelected(true)
    },
    /** Keys on a button inside the block aren't for the editor around it. */
    onKeydown(event: KeyboardEvent) {
      if ((event.target as Element).closest('button, a'))
        event.stopPropagation()
    },
  }
}
