<script setup lang="ts">
import type { EditorVariant, GpsInfo, ImageEditPrivacy, UploadImageOptions } from '@hakulex/editor'
import type { SerializedEditorState } from 'lexical'
import type { Preset } from '../site/presets'
import { RichDiff } from '@hakulex/diff'
import { computeDeltaStats, formatDeltaStats } from '@hakulex/diff-core'
import { RichEditor, themeStyle, validateUrl } from '@hakulex/editor'
import { createDefaultRegistry, serializeToXml } from '@hakulex/litexml'
import { BlockHandlePlugin } from '@hakulex/plugin-block-handle'
import { FloatingToolbarPlugin } from '@hakulex/plugin-floating-toolbar'
import { ImageEditorPlugin } from '@hakulex/plugin-image-editor'
import { LinkEditPlugin } from '@hakulex/plugin-link-edit'
import { LiteXmlPastePlugin } from '@hakulex/plugin-litexml-paste'
import { MentionMenuPlugin } from '@hakulex/plugin-mention'
import { SlashMenuPlugin } from '@hakulex/plugin-slash-menu'
import { TablePlugin } from '@hakulex/plugin-table'
import { ToolbarPlugin } from '@hakulex/plugin-toolbar'
import { extractPolls, RichRenderer } from '@hakulex/renderer'
import { renderToString } from '@vue/server-renderer'
import { computed, createSSRApp, h, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import AccentSwatches from '../components/doc/AccentSwatches.vue'
import SegmentedControl from '../components/doc/SegmentedControl.vue'
import TabBar from '../components/doc/TabBar.vue'
import InspectorSection from '../components/workbench/InspectorSection.vue'
import WorkbenchLayout from '../components/workbench/WorkbenchLayout.vue'
import { diffSample } from '../diff-sample'
import { pollBackend } from '../poll-backend'
import { accentColor, accentTheme } from '../site/accents'
import { openLightbox } from '../site/lightbox'
import { playgroundDoc } from '../site/playground'
import { presets } from '../site/presets'
import { DEVELOPMENT_DOCUMENTS, SAMPLE_DOCUMENTS } from '../site/samples/editor-documents'
import { usePageMeta } from '../site/seo'
import { siteScheme } from '../site/theme'

const variant = ref<EditorVariant>('article')
// The whole site shares one theme, chosen in its side navigation.
const scheme = siteScheme

const panelTab = ref<'settings' | 'json'>('settings')
const panelTabs = [
  { value: 'settings', label: '設定' },
  { value: 'json', label: 'JSON' },
] as const
const variantOptions: { value: EditorVariant, label: string }[] = [
  { value: 'article', label: 'Article' },
  { value: 'note', label: 'Note' },
  { value: 'comment', label: 'Comment' },
  { value: 'chat', label: 'Chat' },
]

/*
 * A site's own accent through the `theme` option: one of the shared accents, in the page's
 * scheme, or one picked by hand. "預設" sets nothing.
 */
const accent = ref('')
const customAccent = ref('')
const theme = computed(() => accentTheme(accent.value === 'custom'
  ? customAccent.value
  : accentColor(accent.value, scheme.value)))
function pickCustom(event: Event) {
  customAccent.value = (event.target as HTMLInputElement).value
  accent.value = 'custom'
}
const editable = ref(true)
usePageMeta(['線上試用編輯器'], '在瀏覽器裡直接試用 hakulex：斜線選單、浮動工具列、表格、圖表和所有節點，還能看 JSON、伺服器端輸出的 HTML、LiteXML 和版本比較。')

const doc = playgroundDoc

const json = computed(() => (doc.value
  ? JSON.stringify(doc.value, null, 2)
  : ''))

type Tab = 'edit' | 'preview' | 'html' | 'litexml' | 'diff'
const tab = ref<Tab>('edit')
const tabs: { id: Tab, label: string }[] = [
  { id: 'edit', label: '編輯' },
  { id: 'preview', label: '預覽' },
  { id: 'html', label: 'SSR HTML' },
  { id: 'litexml', label: 'LiteXML' },
  { id: 'diff', label: '比較' },
]

// The document as LiteXML, to copy and paste back in.
const litexmlRegistry = createDefaultRegistry()
const litexml = computed(() => (doc.value
  ? serializeToXml(doc.value, litexmlRegistry)
  : ''))
// A version kept to compare the document with, as a site would keep its last saved one.
const EMPTY_DOC = {
  root: {
    type: 'root',
    children: [],
    direction: null,
    format: '',
    indent: 0,
    version: 1,
  },
} as unknown as SerializedEditorState
const baseline = shallowRef<SerializedEditorState | null>(null)
const diffLayout = ref<'split' | 'inline'>('split')
const collapseUnchanged = ref(false)
const diffLayoutOptions: { value: 'split' | 'inline', label: string }[] = [
  { value: 'split', label: '左右並排' },
  { value: 'inline', label: '一欄' },
]
const current = computed(() => doc.value ?? EMPTY_DOC)
const diffStats = computed(() => (baseline.value
  ? formatDeltaStats(computeDeltaStats(baseline.value, current.value))
  : ''))
function keepVersion() {
  baseline.value = structuredClone(current.value)
}
const DEV = import.meta.env.DEV
function loadPreset(preset: Preset) {
  replaceDocument(structuredClone(preset.data), `載入${preset.label}`)
}

function loadDiffSample() {
  baseline.value = diffSample.oldValue
  doc.value = structuredClone(diffSample.newValue)
}

/*
 * Loading a document or clearing it replaces what is being edited, so for a while the
 * section offers to put it back. Nothing to offer when there was nothing.
 */
const replaced = shallowRef<{ message: string, previous: SerializedEditorState } | null>(null)
let replacedTimer: ReturnType<typeof setTimeout> | undefined
const UNDO_FOR = 10_000
function replaceDocument(next: SerializedEditorState | null, label: string) {
  const previous = doc.value
  clearTimeout(replacedTimer)
  replaced.value = previous
    ? {
        message: next
          ? `已換成「${label.replace(/^載入/, '')}」`
          : '已清空文件',
        previous,
      }
    : null
  doc.value = next
  if (replaced.value)
    replacedTimer = setTimeout(() => (replaced.value = null), UNDO_FOR)
}
function undoReplace() {
  if (!replaced.value)
    return
  doc.value = replaced.value.previous
  replaced.value = null
  clearTimeout(replacedTimer)
}
onBeforeUnmount(() => clearTimeout(replacedTimer))

const copied = ref(false)
async function copyLitexml() {
  await navigator.clipboard.writeText(litexml.value)
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 1500)
}

// Stands in for an application's upload endpoint: no server, so the file becomes a data URL.
const failUploads = ref(false)
/** What the last image upload was, so the list's choices can be seen to arrive. */
const lastUpload = ref('')
async function uploadImage(file: File, options?: UploadImageOptions) {
  lastUpload.value = `${file.name}・${Math.round(file.size / 1024)} KB${options?.keepOriginal
    ? '・保留原圖'
    : ''}`
  await new Promise(resolve => setTimeout(resolve, 600))
  if (failUploads.value)
    throw new Error('模擬的上傳失敗')
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  return { src }
}

/*
 * A site's own way to find and remove a photo's location, shown with a small reader of a
 * JPEG's EXIF GPS block. Removing draws the picture again, which leaves its EXIF behind.
 */
function readGps(bytes: DataView): GpsInfo | null {
  if (bytes.byteLength < 4 || bytes.getUint16(0) !== 0xFFD8)
    return null
  let offset = 2
  while (offset + 4 <= bytes.byteLength) {
    const marker = bytes.getUint16(offset)
    const length = bytes.getUint16(offset + 2)
    if (marker === 0xFFE1 && bytes.getUint32(offset + 4) === 0x45786966) {
      const tiff = offset + 10
      const little = bytes.getUint16(tiff) === 0x4949
      const u16 = (at: number) => bytes.getUint16(tiff + at, little)
      const u32 = (at: number) => bytes.getUint32(tiff + at, little)
      const entry = (ifd: number, tag: number) => {
        for (let i = 0; i < u16(ifd); i++) {
          if (u16(ifd + 2 + i * 12) === tag)
            return ifd + 2 + i * 12
        }
        return -1
      }
      const pointer = entry(u32(4), 0x8825)
      if (pointer < 0)
        return null
      const gps = u32(pointer + 8)
      const degrees = (tag: number) => {
        const at = entry(gps, tag)
        if (at < 0)
          return 0
        const values = u32(at + 8)
        const part = (n: number) => u32(values + n * 8) / (u32(values + n * 8 + 4) || 1)
        return part(0) + part(1) / 60 + part(2) / 3600
      }
      return {
        latitude: degrees(2),
        longitude: degrees(4),
      }
    }
    offset += 2 + length
  }
  return null
}
const imagePrivacy: ImageEditPrivacy = {
  async detectGps(file) {
    return file.type === 'image/jpeg'
      ? readGps(new DataView(await file.arrayBuffer()))
      : null
  },
  async stripGps(file) {
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, file.type))
    if (!blob)
      throw new Error('無法重新輸出圖片')
    return new File([blob], file.name, { type: blob.type })
  },
}

/*
 * Video and files need real addresses to play and download, so these use the dev server.
 * The built site has no server to keep them: there the editor is given no uploader for
 * them, and it asks for an address instead.
 */
const store = import.meta.env.DEV
  ? async (file: File) => {
    await new Promise(resolve => setTimeout(resolve, 300))
    if (failUploads.value)
      throw new Error('模擬的上傳失敗')
    const response = await fetch(`/__uploads/${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'content-type': file.type || 'application/octet-stream' },
      body: file,
    })
    return await response.json() as { src: string }
  }
  : undefined

// What a server would send for this document: the renderer through renderToString.
const ssrHtml = shallowRef('')
watch([tab, doc, variant, scheme, theme], async () => {
  if (tab.value !== 'html')
    return
  // As a server would: load the polls' state first, so the HTML has their results.
  // Only when there are polls: a document without any shouldn't wait on a backend.
  const ids = doc.value
    ? extractPolls(doc.value as never).map(poll => poll.pollId)
    : []
  const polls = ids.length
    ? await pollBackend.load(ids)
    : {}
  const app = createSSRApp({
    render: () => h(RichRenderer, {
      value: doc.value ?? null,
      variant: variant.value,
      colorScheme: scheme.value,
      theme: theme.value,
      pollAdapter: pollBackend,
      polls,
    }),
  })
  ssrHtml.value = await renderToString(app)
})
</script>

<template>
  <WorkbenchLayout title="編輯器">
    <template #meta>
      <span class="wb-chip">{{ variant }}</span>
    </template>

    <main class="hlx-root page" :data-variant="variant" :data-color-scheme="scheme" :style="themeStyle(theme)">
      <nav class="tabs" role="tablist" aria-label="檢視">
        <button
          v-for="item in tabs"
          :key="item.id"
          type="button"
          role="tab"
          :aria-selected="tab === item.id"
          @click="tab = item.id"
        >
          {{ item.label }}
        </button>
      </nav>

      <!-- v-show keeps the editor (and its undo history) alive while previewing. -->
      <div v-show="tab === 'edit'" class="editor-frame">
        <RichEditor
          v-model="doc"
          :upload-image="uploadImage"
          :image-privacy="imagePrivacy"
          allow-keep-original
          :upload-video="store"
          :upload-file="store"
          :variant="variant"
          :color-scheme="scheme"
          :theme="theme"
          :editable="editable"
          placeholder="輸入 / 插入區塊，或試試 # 標題、- 清單、[ ] 待辦、**粗體**"
        >
          <template #toolbar>
            <ToolbarPlugin :validate-url="validateUrl" />
          </template>
          <FloatingToolbarPlugin :validate-url="validateUrl" />
          <LinkEditPlugin :validate-url="validateUrl" />
          <SlashMenuPlugin />
          <MentionMenuPlugin />
          <LiteXmlPastePlugin />
          <template #nested>
            <FloatingToolbarPlugin :validate-url="validateUrl" />
            <LinkEditPlugin :validate-url="validateUrl" />
            <SlashMenuPlugin />
            <MentionMenuPlugin />
            <LiteXmlPastePlugin />
          </template>
          <TablePlugin />
          <BlockHandlePlugin />
          <ImageEditorPlugin />
        </RichEditor>
      </div>

      <div v-if="tab === 'preview'" class="editor-frame">
        <RichRenderer :value="doc ?? null" :variant="variant" :color-scheme="scheme" :theme="theme" :poll-adapter="pollBackend" @image-click="openLightbox" />
      </div>

      <pre v-if="tab === 'html'" class="code-block">{{ ssrHtml }}</pre>

      <div v-if="tab === 'litexml'" class="litexml">
        <button type="button" class="pg-button" :disabled="!litexml" @click="copyLitexml">
          {{ copied ? '已複製' : '複製 LiteXML' }}
        </button>
        <pre class="code-block" data-testid="litexml">{{ litexml || '（尚未變更）' }}</pre>
      </div>

      <div v-if="tab === 'diff'" class="diff-tab">
        <div class="diff-controls">
          <button type="button" class="pg-button primary" @click="keepVersion">
            記下目前版本
          </button>
          <button type="button" class="pg-button" @click="loadDiffSample">
            載入範例
          </button>
          <SegmentedControl v-model="diffLayout" label="版面" :options="diffLayoutOptions" />
          <label class="pg-toggle">
            <input v-model="collapseUnchanged" type="checkbox" class="pg-switch" :disabled="diffLayout !== 'inline'">
            收合未變更的區塊
          </label>
          <span v-if="baseline" class="diff-stats" role="status">{{ diffStats }}</span>
        </div>
        <RichDiff
          v-if="baseline"
          :old-value="baseline"
          :new-value="current"
          :layout="diffLayout"
          :collapse-unchanged="collapseUnchanged"
          :variant="variant"
          :color-scheme="scheme"
          :theme="theme"
        />
        <p v-else class="diff-empty">
          先按「記下目前版本」，再到「編輯」修改文件，這裡會顯示兩者的差異。
        </p>
      </div>
    </main>

    <template #panel>
      <div class="panel-tabs">
        <TabBar v-model="panelTab" label="面板" :tabs="panelTabs" />
      </div>

      <div v-show="panelTab === 'settings'">
        <InspectorSection title="排版">
          <SegmentedControl v-model="variant" label="Variant" :options="variantOptions" />
        </InspectorSection>
        <InspectorSection title="配色">
          <AccentSwatches v-model="accent" :scheme="scheme">
            <label class="pg-color-custom" :data-chosen="accent === 'custom' || undefined" title="自訂">
              <input
                type="color"
                class="pg-color"
                aria-label="自訂強調色"
                :value="customAccent || '#2563eb'"
                @input="pickCustom"
              >
            </label>
          </AccentSwatches>
        </InspectorSection>
        <InspectorSection title="選項">
          <label class="inspector-row">
            可編輯
            <input v-model="editable" type="checkbox" class="pg-switch">
          </label>
          <label class="inspector-row">
            模擬上傳失敗
            <input v-model="failUploads" type="checkbox" class="pg-switch">
          </label>
          <p v-if="!DEV" class="upload-note">
            展示網站沒有上傳服務：影片和檔案請貼網址，圖片可以直接上傳。
          </p>
          <p v-if="lastUpload" class="last-upload" role="status">
            最後上傳：{{ lastUpload }}
          </p>
        </InspectorSection>
        <InspectorSection title="文件">
          <!-- The same documents as the 範例文件 pages. -->
          <div class="inspector-actions">
            <button v-for="preset in presets" :key="preset.id" type="button" @click="loadPreset(preset)">
              載入{{ preset.label }}
            </button>
          </div>
          <!-- Fixtures for E2E and trying odd cases: only in development, where the tests run, and closed. -->
          <details v-if="DEV" class="dev-documents">
            <summary>測試用文件</summary>
            <div class="inspector-actions">
              <button v-for="item in [...SAMPLE_DOCUMENTS, ...DEVELOPMENT_DOCUMENTS]" :key="item.label" type="button" @click="replaceDocument(item.build(), item.label)">
                {{ item.label }}
              </button>
            </div>
          </details>
          <!-- Apart from the samples, and red: it throws the document away, though it can be undone. -->
          <button type="button" class="pg-button danger inspector-clear" @click="replaceDocument(null, '清空文件')">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
            清空文件
          </button>
          <p v-if="replaced" class="replaced" role="status">
            <span>{{ replaced.message }}</span>
            <button type="button" class="pg-button" @click="undoReplace">
              復原
            </button>
          </p>
        </InspectorSection>
      </div>

      <div v-show="panelTab === 'json'" class="panel-json">
        <details class="json" open>
          <summary>Editor state JSON</summary>
          <pre class="code-block">{{ json || '（尚未變更）' }}</pre>
        </details>
      </div>
    </template>
  </WorkbenchLayout>
</template>

<style>
body {
  margin: 0;
}

.wb-chip {
  padding: 0 7px;
  border: 1px solid var(--hlx-color-border);
  border-radius: 6px;
  color: var(--hlx-color-text-secondary);
  font-family: var(--hlx-font-mono);
  font-size: 12px;
  line-height: 20px;
}

.page {
  box-sizing: border-box;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: 8px 16px 48px;
  background: var(--hlx-color-bg);
  color: var(--hlx-color-text);
}

.editor-frame {
  display: flex;
  flex-direction: column;
  min-height: 240px;
  /* Room on the left for the block handle. */
  padding: 16px 20px 16px 60px;
}

/* Let the editor fill the frame, so all of its blank space is part of the editor. */
.editor-frame > .hlx-editor {
  display: grid;
  /* The toolbar takes what it needs; the rest of the height is the content's. */
  grid-template-rows: auto 1fr;
  flex: 1;
  min-width: 0;
}

/* Under the bar on top. */
.editor-frame .hlx-fixed-toolbar {
  position: sticky;
  top: 44px;
  background: var(--hlx-color-bg);
}

.diff-tab {
  display: grid;
  gap: 12px;
}

.diff-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  font-size: 13px;
}

.diff-stats,
.diff-empty {
  color: var(--hlx-color-text-tertiary);
  font-size: 13px;
}

.litexml {
  display: grid;
  gap: 8px;
  justify-items: start;
}

.litexml .code-block {
  justify-self: stretch;
}

.tabs {
  display: flex;
  gap: 20px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--hlx-color-border);
}

.tabs button {
  height: 40px;
  margin-bottom: -1px;
  padding: 0;
  border: 0;
  border-bottom: 1px solid transparent;
  background: transparent;
  color: var(--hlx-color-text-tertiary);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.tabs button:hover {
  color: var(--hlx-color-text);
}

.tabs button[aria-selected='true'] {
  border-bottom-color: var(--hlx-color-text);
  color: var(--hlx-color-text);
  font-weight: 500;
}

.code-block {
  max-height: 320px;
  white-space: pre-wrap;
  word-break: break-all;
  overflow: auto;
  padding: 12px;
  border-radius: 8px;
  background: var(--hlx-color-bg-secondary);
  font-family: var(--hlx-font-mono);
  font-size: 12.5px;
}

.panel-tabs {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 2px 16px 0;
  border-bottom: 1px solid var(--hlx-color-border);
  background: var(--hlx-color-bg);
}

/* The hand-picked accent, last in the row: a rainbow ring until one is picked. */
.pg-color-custom {
  display: inline-flex;
  border-radius: 50%;
}

.pg-color-custom[data-chosen] {
  outline: 2px solid var(--hlx-color-text);
  outline-offset: 2px;
}

.pg-color-custom .pg-color {
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 50%;
  background: conic-gradient(#ef4444, #eab308, #22c55e, #06b6d4, #6366f1, #d946ef, #ef4444);
}

.pg-color-custom .pg-color::-webkit-color-swatch-wrapper {
  padding: 3px;
}

.pg-color-custom .pg-color::-webkit-color-swatch {
  border-radius: 50%;
}

.pg-color-custom .pg-color::-moz-color-swatch {
  border-radius: 50%;
}

.inspector-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  color: var(--hlx-color-text-secondary);
  font-size: 13px;
}

.inspector-row:first-child {
  margin-top: 0;
}

.upload-note {
  margin: 8px 0 0;
  color: var(--hlx-color-text-tertiary);
  font-size: 12px;
  line-height: 1.6;
}

.last-upload {
  margin: 8px 0 0;
  color: var(--hlx-color-text-tertiary);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.inspector-actions {
  display: grid;
  gap: 2px;
}

.inspector-actions button {
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--hlx-color-text-secondary);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.inspector-actions button:hover {
  background: var(--hlx-color-fill-secondary);
  color: var(--hlx-color-text);
}

.panel-json {
  padding: 12px 16px;
}

.panel-json summary {
  display: none;
}

.panel-json .code-block {
  max-height: none;
  margin: 0;
}
/* The page's own controls, styled to match the rest of the site rather than the browser's. */
.dev-documents {
  margin-top: 8px;
}

.dev-documents summary {
  padding: 6px 8px;
  border-radius: 6px;
  color: var(--hlx-color-text-tertiary);
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}

.dev-documents summary:hover {
  background: var(--hlx-color-fill-secondary);
  color: var(--hlx-color-text-secondary);
}

.dev-documents[open] summary {
  margin-bottom: 2px;
}

.replaced {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 10px 0 0;
  color: var(--hlx-color-text-secondary);
  font-size: 12px;
}

.replaced .pg-button {
  flex: none;
  height: 26px;
}

.inspector-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  margin-top: 10px;
}

.pg-button {
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--hlx-color-border);
  border-radius: 7px;
  background: var(--hlx-color-bg);
  color: var(--hlx-color-text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: background 120ms, border-color 120ms;
}

.pg-button:hover:not(:disabled) {
  background: var(--hlx-color-fill-secondary);
}

.pg-button:disabled {
  color: var(--hlx-color-text-tertiary);
  cursor: default;
}

.pg-button.primary {
  border-color: transparent;
  background: var(--hlx-color-accent);
  color: var(--hlx-color-bg);
  font-weight: 500;
}

.pg-button.danger {
  border-color: color-mix(in oklab, var(--hlx-color-alert-caution) 40%, var(--hlx-color-border));
  color: var(--hlx-color-alert-caution);
}

.pg-button.danger:hover {
  background: color-mix(in oklab, var(--hlx-color-alert-caution) 10%, transparent);
}

.pg-button.primary:hover {
  background: color-mix(in oklab, var(--hlx-color-accent) 88%, var(--hlx-color-text));
}

.pg-button:focus-visible,
.pg-switch:focus-visible,
.pg-color:focus-visible {
  outline: 2px solid var(--hlx-color-accent);
  outline-offset: 2px;
}

.pg-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--hlx-color-text-secondary);
  cursor: pointer;
}

.pg-toggle:has(:disabled) {
  color: var(--hlx-color-text-tertiary);
  cursor: default;
}

.pg-switch {
  appearance: none;
  position: relative;
  flex: none;
  width: 30px;
  height: 18px;
  margin: 0;
  border-radius: 999px;
  background: var(--hlx-color-fill);
  cursor: pointer;
  transition: background 150ms;
}

.pg-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.25);
  transition: transform 150ms;
}

.pg-switch:checked {
  background: var(--hlx-color-accent);
}

.pg-switch:checked::after {
  transform: translateX(12px);
}

.pg-switch:disabled {
  opacity: 0.45;
  cursor: default;
}

.pg-color {
  appearance: none;
  width: 30px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--hlx-color-border);
  border-radius: 6px;
  background: none;
  cursor: pointer;
}

.pg-color::-webkit-color-swatch-wrapper {
  padding: 2px;
}

.pg-color::-webkit-color-swatch {
  border: 0;
  border-radius: 4px;
}

.pg-color::-moz-color-swatch {
  border: 0;
  border-radius: 4px;
}
</style>
