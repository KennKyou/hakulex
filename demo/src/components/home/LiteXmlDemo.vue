<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { createDefaultRegistry, deserializeFromXml, serializeToXml } from '@hakulex/litexml'
import { RichRenderer } from '@hakulex/renderer'
import { ref, shallowRef, watch } from 'vue'
import { article } from '../../site/examples/documents'
import { siteScheme } from '../../site/theme'

/*
 * A document as an AI would read it and write it back: the XML on top can be edited, and the
 * document under it is that XML read back in. What cannot be read leaves the last one showing.
 */
const registry = createDefaultRegistry()
const original = serializeToXml(article, registry)

const xml = ref(original)
const doc = shallowRef<SerializedEditorState>(article)
const broken = ref(false)

watch(xml, (value) => {
  try {
    const next = deserializeFromXml(value, registry)
    broken.value = next.root.children.length === 0
    if (!broken.value)
      doc.value = next
  }
  catch {
    broken.value = true
  }
})
</script>

<template>
  <div class="litexml-demo">
    <div class="litexml-demo-head">
      <span>AI 讀到、也會寫回來的內容，改改看</span>
      <button v-if="xml !== original" type="button" @click="xml = original">
        還原
      </button>
    </div>
    <textarea v-model="xml" spellcheck="false" aria-label="文件的 LiteXML" rows="5" />
    <p class="litexml-demo-arrow" :data-broken="broken || undefined">
      {{ broken ? '這段 XML 讀不出來，下面先保留上一次的結果' : '↓ 讀回來就是這份文件' }}
    </p>
    <div class="litexml-demo-result">
      <RichRenderer :value="doc" :color-scheme="siteScheme" />
    </div>
  </div>
</template>

<style scoped>
.litexml-demo {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.litexml-demo-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 24px;
  color: var(--hlx-color-text-tertiary);
  font-size: 12px;
}

.litexml-demo-head button {
  padding: 2px 8px;
  border: 1px solid var(--hlx-color-border);
  border-radius: 6px;
  background: transparent;
  color: var(--hlx-color-text-secondary);
  font: inherit;
  cursor: pointer;
}

.litexml-demo-head button:hover {
  color: var(--hlx-color-text);
}

textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--hlx-color-border);
  border-radius: 8px;
  background: var(--hlx-color-bg);
  color: var(--hlx-color-text);
  font-family: var(--hlx-font-mono);
  font-size: 12.5px;
  line-height: 1.6;
  resize: vertical;
}

textarea:focus-visible {
  border-color: var(--hlx-color-accent);
  outline: none;
}

.litexml-demo-arrow {
  margin: 0;
  color: var(--hlx-color-text-tertiary);
  font-size: 12px;
}

.litexml-demo-arrow[data-broken] {
  color: var(--hlx-color-danger, #c0392b);
}

/* Drawn smaller, so the whole document shows under the XML without scrolling the cell. */
.litexml-demo-result {
  zoom: 0.66;
  padding: 0 16px;
  border: 1px solid var(--hlx-color-border);
  border-radius: 8px;
  background: var(--hlx-color-bg);
}
</style>
