<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import type { Component } from 'vue'
import type { PackageKind } from '../../site/packages'
import { RichRenderer } from '@hakulex/renderer'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import DocPage from '../../components/doc/DocPage.vue'
import { findPackage, neighbouringPackages, packagesPath } from '../../site/packages'
import { siteScheme } from '../../site/theme'

/*
 * One plugin or package. The code it shows is the source of the example it runs. The router
 * only comes here for one that exists, and App.vue keys the page, so each one starts over.
 */
const props = defineProps<{ kind: PackageKind }>()
const entry = findPackage(props.kind, useRoute().params.id)!
const { previous, next } = neighbouringPackages(entry)
const base = packagesPath(props.kind)
const toLink = (other: typeof previous) => other && { label: other.label, to: `${base}/${other.id}` }
const groupLabel = props.kind === 'plugin'
  ? '外掛'
  : '套件'

const path = `../../site/examples/${entry.id}.vue`
const examples = import.meta.glob<Component>('../../site/examples/*.vue', { eager: true, import: 'default' })
const sources = import.meta.glob<string>('../../site/examples/*.vue', { eager: true, import: 'default', query: '?raw' })
const example = examples[path]

/*
 * The examples are written as they would be in an app, with no color scheme, and the page gives
 * them the site's. One whose template starts with an editor, a renderer or a comparison takes it
 * as its own setting; any other has nowhere to put it and follows the frame around it.
 */
const takesScheme = /<template>\s*<(?:RichEditor|RichRenderer|RichDiff)\b/.test(sources[path] ?? '')
const exampleProps = computed(() => takesScheme
  ? { colorScheme: siteScheme.value }
  : {})

function code(language: string, value: string) {
  return {
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children: [
        {
          type: 'code-block',
          version: 1,
          language,
          code: value,
        },
      ],
    },
  } as unknown as SerializedEditorState
}

const install = code('bash', `pnpm add ${entry.packageName}`)
const usage = entry.commands
  ? code('bash', entry.commands)
  : code('vue', sources[path])
const tryText = entry.tryText
  ? code('xml', entry.tryText)
  : null
</script>

<template>
  <DocPage
    :crumbs="[{ label: '參考' }, { label: groupLabel, to: base }, { label: entry.label }]"
    :title="entry.label"
    :lead="entry.description"
    :previous="toLink(previous)"
    :next="toLink(next)"
  >
    <template #meta>
      <code class="doc-chip pkg-meta">{{ entry.packageName }}</code>
    </template>

    <section v-if="example" class="doc-section">
      <h2 class="doc-h2">
        展示
      </h2>
      <p v-if="entry.hint" class="doc-note pkg-hint">
        {{ entry.hint }}
      </p>
      <div v-if="tryText" class="pkg-try">
        <RichRenderer :value="tryText" :color-scheme="siteScheme" />
      </div>
      <div class="doc-preview pkg-demo hlx-root" :data-color-scheme="siteScheme">
        <component :is="example" v-bind="exampleProps" />
      </div>
    </section>

    <section class="doc-section pkg-install">
      <h2 class="doc-h2">
        安裝
      </h2>
      <RichRenderer :value="install" :color-scheme="siteScheme" />
      <p v-if="kind === 'plugin'" class="doc-note">
        外掛要放在 <code>@hakulex/editor</code> 的 <code>RichEditor</code> 裡。
      </p>
    </section>

    <section class="doc-section pkg-usage">
      <h2 class="doc-h2">
        使用
      </h2>
      <p v-if="entry.commands" class="doc-note">
        這個工具在終端機執行，沒有網頁上的展示。
      </p>
      <RichRenderer :value="usage" :color-scheme="siteScheme" />
    </section>

    <section v-if="entry.props" class="doc-section pkg-props">
      <h2 class="doc-h2">
        Props
      </h2>
      <div v-if="entry.props.length" class="doc-table-wrap">
        <table class="doc-table">
          <thead>
            <tr>
              <th>名稱</th>
              <th>型別</th>
              <th>說明</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="prop in entry.props" :key="prop.name">
              <td><code>{{ prop.name }}</code></td>
              <td><code>{{ prop.type }}</code></td>
              <td>{{ prop.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="doc-note">
        不需要設定。
      </p>
    </section>
  </DocPage>
</template>

<style scoped>
.pkg-try {
  margin-bottom: 12px;
}

/* Room on the left for the block handle. */
.pkg-demo {
  min-height: 160px;
  padding-left: var(--hlx-space-xl);
  background: var(--hlx-color-bg);
  color: var(--hlx-color-text);
}

.pkg-demo :deep(pre) {
  margin: 0;
  overflow: auto;
  font-family: var(--hlx-font-mono);
  font-size: 13px;
}
</style>
