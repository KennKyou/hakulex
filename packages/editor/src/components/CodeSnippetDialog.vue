<script setup lang="ts">
import type { BlockFields } from '../plugins/ContentBlockPlugin'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { Compartment, EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { fileIcon, normalizeSnippetFiles, snippetLanguage } from '@hakulex/renderer'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, shallowRef, useTemplateRef, watch } from 'vue'
import { IconClose, IconPlus } from '../chart/icons'
import { loadCodeMirrorLanguage } from '../code/cm-languages'
import { codeMirrorTheme } from '../code/cm-theme'
import { snippetMarks } from '../code/snippet-marks'
import BlockDialog from './BlockDialog.vue'
import LanguageCombobox from './LanguageCombobox.vue'

const props = defineProps<{ initial?: BlockFields }>()
const emit = defineEmits<{ save: [fields: BlockFields, unchanged: boolean], cancel: [] }>()

interface Draft {
  /** The file as stored, so fields this dialog doesn't know stay. */
  source: Record<string, unknown>
  filename: string
  code: string
  language: string | undefined
  /** The marked lines as loaded, within the code. */
  marks: number[]
  /** The marked lines once someone changes them; until then the stored ones stay as they are. */
  marked: number[] | null
}

const stored = Array.isArray(props.initial?.files)
  ? (props.initial.files as unknown[]).filter(file => normalizeSnippetFiles([file]).length) as Record<string, unknown>[]
  : []

function toDraft(source: Record<string, unknown>): Draft {
  const [file] = normalizeSnippetFiles([source])
  return {
    source,
    filename: file.filename,
    code: file.code,
    language: file.language,
    marks: [...file.highlightLines].filter(line => line <= file.code.split('\n').length).sort((a, b) => a - b),
    marked: null,
  }
}

const files = reactive<Draft[]>(stored.length
  ? stored.map(toDraft)
  : [
      {
        source: {},
        filename: 'untitled.ts',
        code: '',
        language: undefined,
        marks: [],
        marked: null,
      },
    ])
const active = shallowRef(0)
const current = computed(() => files[active.value])

function toStored({ source, filename, code, language, marked }: Draft) {
  const { language: _language, highlightLines, ...rest } = source
  const lines = marked === null
    ? highlightLines
    : (marked.length
        ? marked
        : undefined)
  return {
    ...rest,
    filename,
    code,
    ...(language === undefined
      ? {}
      : { language }),
    ...(lines === undefined
      ? {}
      : { highlightLines: lines }),
  }
}

const result = () => files.map(toStored)
// What saving a new block with nothing typed gives doesn't count as a change to leave behind.
const baseline = JSON.stringify(stored.length
  ? stored
  : files.map(toStored))
const dirty = computed(() => JSON.stringify(result()) !== baseline)

/* Renaming, in the list: a double click or F2 opens it, Enter applies, Esc leaves it. */

const renaming = shallowRef<number | null>(null)
const renameText = shallowRef('')
const nameError = shallowRef<string | null>(null)
const list = useTemplateRef<HTMLElement>('list')
const item = (index: number) => list.value?.querySelectorAll<HTMLElement>('[role="option"]')[index]

async function startRename(index: number) {
  if (renaming.value !== null && !applyName())
    return
  showFile(index)
  renaming.value = index
  renameText.value = files[index].filename
  nameError.value = null
  await nextTick()
  const input = list.value?.querySelector<HTMLInputElement>('.hlx-snippet-rename')
  input?.focus()
  input?.select()
}

function stopRename(focus = true) {
  const index = renaming.value
  renaming.value = null
  nameError.value = null
  if (focus && index !== null)
    void nextTick(() => item(index)?.focus())
}

/** Applies the name being typed. False, with the reason on show, when it can't be used. */
function applyName(): boolean {
  const index = renaming.value
  if (index === null)
    return true
  const next = renameText.value.trim()
  if (!next) {
    nameError.value = '檔名不能空白。'
    return false
  }
  if (files.some((file, other) => other !== index && file.filename === next)) {
    nameError.value = '已經有這個檔名。'
    return false
  }
  if (next !== files[index].filename) {
    files[index].filename = next
    // It goes by the new name now, unless someone picks one.
    files[index].language = undefined
  }
  return true
}

// Keys typed in the name stay there: the arrows mustn't pick another file.
function onRenameKeydown(event: KeyboardEvent) {
  event.stopPropagation()
}

/*
 * Enter and Esc in the name are the name's. The dialog hears Esc on the document before the
 * field does, and would take it for leaving, so these are caught on the way down, first.
 */
function onWindowKeydown(event: KeyboardEvent) {
  if (renaming.value === null || event.isComposing || !(event.target as Element | null)?.classList?.contains('hlx-snippet-rename'))
    return
  if (event.key !== 'Enter' && event.key !== 'Escape')
    return
  event.preventDefault()
  event.stopImmediatePropagation()
  if (event.key === 'Escape')
    stopRename()
  else if (applyName())
    stopRename()
}
onMounted(() => window.addEventListener('keydown', onWindowKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKeydown, true))

// Leaving the field applies the name if it can, and keeps it open with the reason if not.
function onRenameBlur() {
  if (renaming.value !== null && applyName())
    stopRename(false)
}

/* The code */

const host = useTemplateRef<HTMLElement>('host')
const languageCompartment = new Compartment()
// The marked lines of the file on show: read back after each change to them or the code.
let readMarks: ((state: EditorState) => number[]) | null = null
let view: EditorView | null = null

function stateFor(file: Draft) {
  const marks = snippetMarks(file.marked ?? file.marks)
  readMarks = marks.read
  return EditorState.create({
    doc: file.code,
    extensions: [
      // Tab is for indenting here, and the dialog's focus trap must not see it.
      Prec.highest(EditorView.domEventHandlers({
        keydown: (event) => {
          if (event.key === 'Tab')
            event.stopPropagation()
          return false
        },
      })),
      history(),
      keymap.of([
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap,
      ]),
      marks.extension,
      languageCompartment.of([]),
      codeMirrorTheme,
      EditorView.updateListener.of((update) => {
        if (update.docChanged)
          current.value.code = update.state.doc.toString()
        const now = readMarks?.(update.state)
        if (now && (update.docChanged || update.transactions.some(transaction => transaction.effects.length))) {
          const file = current.value
          // Back to what was loaded is no change: the stored value stays as it was.
          file.marked = now.join() === file.marks.join() && file.marked === null
            ? null
            : now
        }
      }),
    ],
  })
}

const language = computed({
  get: () => snippetLanguage(current.value),
  set: (id: string) => {
    current.value.language = id
  },
})

async function applyLanguage(id: string) {
  const extension = await loadCodeMirrorLanguage(id)
  if (view && id === language.value) {
    view.dispatch({
      effects: languageCompartment.reconfigure(extension),
    })
  }
}

// The dialog mounts its content a little after this component.
watch(host, (element) => {
  if (!element || view)
    return
  view = new EditorView({
    parent: element,
    state: stateFor(current.value),
  })
  void applyLanguage(language.value)
}, { flush: 'post' })
onBeforeUnmount(() => {
  view?.destroy()
  view = null
})

watch(language, id => void applyLanguage(id))
// Each file has its own undo history, which goes when the dialog does.
function showFile(index: number) {
  if (index === active.value)
    return
  active.value = index
  view?.setState(stateFor(current.value))
  void applyLanguage(language.value)
}

/* Files: picked by click or the arrow keys, moved with Alt and the arrows or by dragging. */

async function pick(index: number, focus = true) {
  if (renaming.value !== null && !applyName())
    return
  stopRename(false)
  showFile(index)
  if (focus) {
    await nextTick()
    item(index)?.focus()
  }
}

function addFile() {
  if (renaming.value !== null && !applyName())
    return
  stopRename(false)
  let filename = 'untitled.ts'
  for (let n = 2; files.some(file => file.filename === filename); n++)
    filename = `untitled-${n}.ts`
  files.push({
    source: {},
    filename,
    code: '',
    language: undefined,
    marks: [],
    marked: null,
  })
  showFile(files.length - 1)
}

function removeFile(index: number) {
  if (files.length === 1)
    return
  stopRename(false)
  const wasActive = index === active.value
  files.splice(index, 1)
  if (wasActive || active.value >= files.length) {
    active.value = Math.min(index, files.length - 1)
    view?.setState(stateFor(current.value))
    void applyLanguage(language.value)
  }
  else if (index < active.value) {
    active.value--
  }
  void nextTick(() => item(active.value)?.focus())
}

/** Moves a file to another place in the list; the one on show stays on show. */
function moveFile(from: number, to: number) {
  if (from === to || to < 0 || to >= files.length)
    return
  const shown = files[active.value]
  const [moved] = files.splice(from, 1)
  files.splice(to, 0, moved)
  active.value = files.indexOf(shown)
}

function onItemKeydown(event: KeyboardEvent, index: number) {
  const step = event.key === 'ArrowDown'
    ? 1
    : event.key === 'ArrowUp'
      ? -1
      : 0
  if (step && event.altKey) {
    event.preventDefault()
    moveFile(index, index + step)
    void nextTick(() => item(files.indexOf(current.value))?.focus())
  }
  else if (step) {
    event.preventDefault()
    const next = index + step
    if (next >= 0 && next < files.length)
      void pick(next)
  }
  else if (event.key === 'F2') {
    event.preventDefault()
    void startRename(index)
  }
  else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    removeFile(index)
  }
}

/* Dragging by the grip: the file goes where the pointer is let go. */
const dragging = shallowRef<number | null>(null)
const dropAt = shallowRef<number | null>(null)

function startDrag(event: PointerEvent, index: number) {
  if (event.button !== 0)
    return
  event.preventDefault()
  ;(event.target as Element).setPointerCapture?.(event.pointerId)
  dragging.value = index
  dropAt.value = index
}

function onDrag(event: PointerEvent) {
  if (dragging.value === null)
    return
  const options = [
    ...(list.value?.querySelectorAll<HTMLElement>('[role="option"]') ?? []),
  ]
  let at = options.length - 1
  for (const [index, option] of options.entries()) {
    const box = option.getBoundingClientRect()
    if (event.clientY < box.top + box.height / 2) {
      at = index
      break
    }
  }
  dropAt.value = at
}

function endDrag() {
  if (dragging.value !== null && dropAt.value !== null)
    moveFile(dragging.value, dropAt.value)
  dragging.value = null
  dropAt.value = null
}

/* Saving: the dialog's button and Cmd+Enter, and Cmd+S. */
function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 's') {
    event.preventDefault()
    event.stopPropagation()
    save()
  }
}

// The file's icon, as a component the template can place.
function FileIcon(props: { name: string, language?: string }) {
  return fileIcon(props.name, props.language)
}

function save() {
  if (applyName()) {
    stopRename(false)
    emit('save', {
      files: result(),
    }, !dirty.value)
  }
}
</script>

<template>
  <BlockDialog
    :title="initial ? '編輯程式碼片段' : '插入程式碼片段'"
    description="左側是檔案，右側是目前檔案的程式碼。點行號或按 Alt+H 標記強調行。⌘S 或 ⌘Enter 儲存。"
    :dirty="dirty || (renaming !== null && renameText.trim() !== files[renaming]?.filename)"
    @save="save"
    @cancel="emit('cancel')"
  >
    <div class="hlx-snippet-dialog" @keydown="onKeydown">
      <aside class="hlx-snippet-files">
        <div class="hlx-snippet-files-head">
          <span>檔案</span>
          <button type="button" class="hlx-snippet-icon-button" aria-label="新增檔案" title="新增檔案" @click="addFile">
            <IconPlus />
          </button>
        </div>
        <ul
          ref="list"
          class="hlx-snippet-file-list"
          role="listbox"
          aria-label="檔案"
          @pointermove="onDrag"
          @pointerup="endDrag"
          @pointercancel="endDrag"
        >
          <li
            v-for="(file, index) in files"
            :key="index"
            role="option"
            class="hlx-snippet-file"
            :aria-label="file.filename"
            :aria-selected="index === active"
            :tabindex="index === active ? 0 : -1"
            :data-autofocus="index === active || undefined"
            :data-dragging="dragging === index || undefined"
            :data-drop="dragging !== null && dropAt === index && dropAt !== dragging ? (dropAt < dragging ? 'before' : 'after') : undefined"
            @click="renaming !== index && pick(index, false)"
            @dblclick="startRename(index)"
            @keydown.self="onItemKeydown($event, index)"
          >
            <span class="hlx-snippet-file-grip" aria-hidden="true" title="拖曳排序" @pointerdown="startDrag($event, index)">
              <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><circle cx="6" cy="4" r="1" /><circle cx="10" cy="4" r="1" /><circle cx="6" cy="8" r="1" /><circle cx="10" cy="8" r="1" /><circle cx="6" cy="12" r="1" /><circle cx="10" cy="12" r="1" /></svg>
            </span>
            <FileIcon :name="file.filename" :language="file.language" />
            <input
              v-if="renaming === index"
              v-model="renameText"
              class="hlx-snippet-rename"
              aria-label="檔名"
              spellcheck="false"
              autocomplete="off"
              :aria-invalid="!!nameError || undefined"
              @keydown="onRenameKeydown"
              @blur="onRenameBlur"
              @click.stop
              @dblclick.stop
            >
            <span v-else class="hlx-snippet-file-name">{{ file.filename }}</span>
            <button
              type="button"
              class="hlx-snippet-file-remove"
              tabindex="-1"
              :aria-label="`刪除 ${file.filename}`"
              :title="files.length === 1 ? '至少要有一個檔案' : '刪除'"
              :disabled="files.length === 1"
              @click.stop="removeFile(index)"
            >
              <IconClose />
            </button>
          </li>
        </ul>
        <p v-if="nameError" class="hlx-block-dialog-error" role="alert">
          {{ nameError }}
        </p>
      </aside>
      <section class="hlx-snippet-current">
        <div class="hlx-snippet-current-head">
          <FileIcon :name="current.filename" :language="current.language" />
          <span class="hlx-snippet-current-name">{{ current.filename }}</span>
          <LanguageCombobox v-model="language" />
          <span class="hlx-snippet-mark-hint">點行號標記強調行</span>
        </div>
        <div ref="host" class="hlx-snippet-dialog-code" />
      </section>
    </div>
    <template #status>
      {{ files.length }} 個檔案
    </template>
  </BlockDialog>
</template>
