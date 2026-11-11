<script setup lang="ts">
import type { EditorVariantName } from '@hakulex/style-token'
import type { SerializedEditorState } from 'lexical'
import { RichRenderer } from '@hakulex/renderer'
import { HOSTED_TOKENS, TOKEN_GROUPS } from '@hakulex/style-token'
import { onMounted, ref, watch } from 'vue'
import DocPage from '../components/doc/DocPage.vue'
import SegmentedControl from '../components/doc/SegmentedControl.vue'
import { siteScheme } from '../site/theme'

/* Every token, with the values the stylesheet really gives it in each color scheme. */
const groupLabels: Record<string, string> = {
  color: '顏色',
  space: '間距',
  flow: '段落間距',
  typography: '字型',
  radius: '圓角',
  layout: '版面',
  shadow: '陰影',
}
const groups = Object.entries(TOKEN_GROUPS).map(([key, names]) => ({
  key,
  label: groupLabels[key] ?? key,
  rows: Object.entries(names as Record<string, string>).map(([name, variable]) => ({ name, variable })),
}))

const variants: { value: EditorVariantName, label: string }[] = [
  { value: 'article', label: 'Article' },
  { value: 'note', label: 'Note' },
  { value: 'comment', label: 'Comment' },
  { value: 'chat', label: 'Chat' },
]
const variant = ref<EditorVariantName>('article')

const lightStage = ref<HTMLElement>()
const darkStage = ref<HTMLElement>()
const values = ref<Record<string, { light: string, dark: string }>>({})

function readValues() {
  if (!lightStage.value || !darkStage.value)
    return
  const light = getComputedStyle(lightStage.value)
  const dark = getComputedStyle(darkStage.value)
  values.value = Object.fromEntries(groups.flatMap(group => group.rows).map(({ variable }) => [
    variable,
    {
      light: light.getPropertyValue(variable).trim(),
      dark: dark.getPropertyValue(variable).trim(),
    },
  ]))
}
onMounted(readValues)
watch(variant, readValues, { flush: 'post' })

const hostCss = `:root {
  --hlx-host-color-text: var(--color-fg);
  --hlx-host-color-bg: var(--color-surface);
  --hlx-host-color-border: var(--color-border);
  --hlx-host-color-accent: var(--color-accent);
  --hlx-host-font-family-sans: var(--app-font-sans);
}`
const hostDoc = {
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
        language: 'css',
        code: hostCss,
      },
    ],
  },
} as unknown as SerializedEditorState
</script>

<template>
  <DocPage :crumbs="[{ label: '參考' }, { label: 'Token' }]" title="Token" wide>
    <template #lead>
      <code class="tokens-package">@hakulex/style-token</code> 的設計 token。下面的值是從樣式表實際讀到的，可以切換排版比較。
    </template>
    <SegmentedControl v-model="variant" label="排版" :options="variants" />

    <div ref="lightStage" class="hlx-root tokens-stage" data-color-scheme="light" :data-variant="variant" />
    <div ref="darkStage" class="hlx-root tokens-stage" data-color-scheme="dark" :data-variant="variant" />

    <section v-for="group in groups" :key="group.key" class="doc-section token-group">
      <h2 class="doc-h2">
        {{ group.label }}
      </h2>
      <div class="doc-table-wrap">
        <table class="doc-table">
          <thead>
            <tr>
              <th>名稱</th>
              <th>CSS 變數</th>
              <th>淺色</th>
              <th>深色</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in group.rows" :key="row.variable" class="token-row" :data-token="row.variable">
              <td>{{ row.name }}</td>
              <td><code>{{ row.variable }}</code></td>
              <td v-for="scheme in (['light', 'dark'] as const)" :key="scheme">
                <span v-if="group.key === 'color'" class="token-swatch" :style="{ background: values[row.variable]?.[scheme] }" />
                <code :data-value="scheme">{{ values[row.variable]?.[scheme] }}</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="doc-section token-host">
      <h2 class="doc-h2">
        接上網站的設計
      </h2>
      <p class="doc-note">
        顏色和字型會先讀網站自己的 <code>--hlx-host-*</code> 變數，沒有設定時才用預設值。在網站的樣式裡這樣寫：
      </p>
      <RichRenderer :value="hostDoc" :color-scheme="siteScheme" />
      <p class="doc-note">
        下面每個變數都可以這樣覆寫，把開頭的 <code>--hlx-</code> 換成 <code>--hlx-host-</code>：
      </p>
      <ul class="token-hosted">
        <li v-for="name in HOSTED_TOKENS" :key="name">
          <code>{{ name }}</code>
        </li>
      </ul>
    </section>
  </DocPage>
</template>

<style scoped>
.tokens-package {
  font-family: var(--hlx-font-mono);
  font-size: 14px;
}

.tokens-stage {
  display: none;
}

.token-group:first-of-type {
  margin-top: 32px;
}

.token-group .doc-h2 {
  margin-bottom: 12px;
}

code {
  font-family: var(--hlx-font-mono);
}

.token-swatch {
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: 6px;
  border-radius: 4px;
  box-shadow: 0 0 0 1px var(--hlx-color-border);
  vertical-align: middle;
}

.token-hosted {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 4px;
  margin: 0;
  padding: 0;
  color: var(--hlx-color-text-secondary);
  font-size: 13px;
  list-style: none;
}
</style>
