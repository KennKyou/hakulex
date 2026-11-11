<script setup lang="ts">
import type { CaretPlacement } from '../code/focus'
import type { CodeBlockNode } from '../nodes/CodeBlockNode'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { Compartment, EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { CodeBlockView } from '@hakulex/renderer'
import { useLexicalComposer, useLexicalEditable, useLexicalNodeSelection } from '@hakulex/vue-lexical'
import {
  $createNodeSelection,
  $createParagraphNode,
  $getNodeByKey,
  $isDecoratorNode,
  $isElementNode,
  $setSelection,
} from 'lexical'
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import { loadCodeMirrorLanguage } from '../code/cm-languages'
import { codeMirrorTheme } from '../code/cm-theme'
import { registerCodeBlockFocuser } from '../code/focus'
import LanguageCombobox from './LanguageCombobox.vue'

const props = defineProps<{ nodeKey: string, code: string, language: string }>()

const editor = useLexicalComposer()
const editable = useLexicalEditable()
const { isSelected } = useLexicalNodeSelection(props.nodeKey)
const card = useTemplateRef<HTMLElement>('card')
const host = useTemplateRef<HTMLElement>('host')

const languageCompartment = new Compartment()
const editableCompartment = new Compartment()
let view: EditorView | null = null
// Set while pushing a Lexical-side change into CodeMirror, so it isn't echoed back.
let applyingExternal = false

function $node(): CodeBlockNode | null {
  const node = $getNodeByKey(props.nodeKey)
  return node?.getType() === 'code-block'
    ? (node as CodeBlockNode)
    : null
}

/* Leaving the block */

/**
 * Hands focus back to Lexical. Must happen before the selection update:
 * `editor.focus()` skips `root.focus()` while an update is pending, and moving
 * only the DOM selection leaves focus in CodeMirror's contenteditable.
 */
function focusLexical() {
  view?.contentDOM.blur()
  editor.getRootElement()?.focus({ preventScroll: true })
}

/** Moves the Lexical caret before / after the block, creating a paragraph if there is none. */
function exit(direction: 'before' | 'after', alwaysNewParagraph = false) {
  focusLexical()
  editor.update(() => {
    const node = $node()
    if (!node)
      return
    let sibling = direction === 'before'
      ? node.getPreviousSibling()
      : node.getNextSibling()
    if (!sibling || alwaysNewParagraph) {
      const paragraph = $createParagraphNode()
      if (direction === 'before')
        node.insertBefore(paragraph)
      else
        node.insertAfter(paragraph)
      sibling = paragraph
    }
    if ($isElementNode(sibling)) {
      if (direction === 'before')
        sibling.selectEnd()
      else
        sibling.selectStart()
    }
    else if ($isDecoratorNode(sibling)) {
      const selection = $createNodeSelection()
      selection.add(sibling.getKey())
      $setSelection(selection)
    }
  })
}

/** Backspace in an empty block turns it back into a paragraph. */
function unwrap() {
  focusLexical()
  editor.update(() => {
    const node = $node()
    if (!node)
      return
    const paragraph = $createParagraphNode()
    node.replace(paragraph)
    paragraph.select()
  })
}

const boundaryKeymap = Prec.highest(keymap.of([
  {
    key: 'ArrowUp',
    run: (v) => {
      const { main } = v.state.selection
      if (!main.empty || v.state.doc.lineAt(main.head).number !== 1)
        return false
      exit('before')
      return true
    },
  },
  {
    key: 'ArrowDown',
    run: (v) => {
      const { main } = v.state.selection
      if (!main.empty || v.state.doc.lineAt(main.head).number !== v.state.doc.lines)
        return false
      exit('after')
      return true
    },
  },
  {
    key: 'ArrowLeft',
    run: (v) => {
      const { main } = v.state.selection
      if (!main.empty || main.head !== 0)
        return false
      exit('before')
      return true
    },
  },
  {
    key: 'ArrowRight',
    run: (v) => {
      const { main } = v.state.selection
      if (!main.empty || main.head !== v.state.doc.length)
        return false
      exit('after')
      return true
    },
  },
  {
    key: 'Mod-Enter',
    run: () => {
      exit('after', true)
      return true
    },
  },
  {
    key: 'Backspace',
    run: (v) => {
      if (v.state.doc.length > 0)
        return false
      unwrap()
      return true
    },
  },
]))

/* CodeMirror lifecycle */

function focusAt(placement: CaretPlacement) {
  if (!view)
    return
  const anchor = placement === 'start'
    ? 0
    : view.state.doc.length
  view.dispatch({
    selection: { anchor },
  })
  view.focus()
}

let unregisterFocuser: (() => void) | undefined

onMounted(() => {
  view = new EditorView({
    parent: host.value!,
    state: EditorState.create({
      doc: props.code,
      extensions: [
        // Keys typed in CodeMirror must never reach Lexical's root listeners. This
        // has to run before any keymap: a handled key stops CodeMirror's own
        // handler chain, and lower-precedence handlers would never see it.
        Prec.highest(EditorView.domEventHandlers({
          keydown: (event) => {
            event.stopPropagation()
            return false
          },
        })),
        boundaryKeymap,
        history(),
        keymap.of([
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        // Numbered lines, as the renderer numbers them.
        lineNumbers(),
        languageCompartment.of([]),
        editableCompartment.of(editableExtensions(editable.value)),
        codeMirrorTheme,
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || applyingExternal)
            return
          const code = update.state.doc.toString()
          editor.update(() => {
            $node()?.setCode(code)
          })
        }),
      ],
    }),
  })
  void applyLanguage(props.language)
  // Also applies a focus request made before mount (a freshly inserted block).
  unregisterFocuser = registerCodeBlockFocuser(editor, props.nodeKey, focusAt)
})

onBeforeUnmount(() => {
  unregisterFocuser?.()
  view?.destroy()
  view = null
})

function editableExtensions(value: boolean) {
  return [
    EditorView.editable.of(value),
    EditorState.readOnly.of(!value),
  ]
}

async function applyLanguage(id: string) {
  const extension = await loadCodeMirrorLanguage(id)
  if (view && id === props.language) {
    view.dispatch({
      effects: languageCompartment.reconfigure(extension),
    })
  }
}

// Lexical-side changes (undo, collaboration, setCode) flow into CodeMirror.
watch(() => props.code, (code) => {
  if (!view || code === view.state.doc.toString())
    return
  applyingExternal = true
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: code },
  })
  applyingExternal = false
})
watch(() => props.language, id => void applyLanguage(id))
watch(editable, (value) => {
  view?.dispatch({
    effects: editableCompartment.reconfigure(editableExtensions(value)),
  })
})

// Arrowing onto the block from a neighbor (NodeSelection) moves into CodeMirror,
// unless focus is already somewhere inside the card (e.g. the language picker).
watch(isSelected, (selected) => {
  if (selected && editable.value && !card.value?.contains(document.activeElement))
    focusAt('start')
})

function setLanguage(id: string) {
  editor.update(() => {
    $node()?.setLanguage(id)
  })
}
</script>

<template>
  <div ref="card" class="hlx-code-editor" :data-selected="isSelected || undefined">
    <CodeBlockView :code="code" :language="language" :highlight="false" :collapsible="false">
      <template #language>
        <LanguageCombobox :model-value="language" :disabled="!editable" @update:model-value="setLanguage" />
      </template>
      <div ref="host" class="hlx-code-cm" />
    </CodeBlockView>
  </div>
</template>
