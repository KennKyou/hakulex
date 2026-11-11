<script setup lang="ts">
import type { PackageKind } from '../../site/packages'
import DocPage from '../../components/doc/DocPage.vue'
import TileGrid from '../../components/doc/TileGrid.vue'
import { packagesOf, packagesPath } from '../../site/packages'

/* Every plugin, or every package. */
const props = defineProps<{ kind: PackageKind }>()
const tiles = packagesOf(props.kind).map(entry => ({
  to: `${packagesPath(props.kind)}/${entry.id}`,
  title: entry.label,
  code: entry.packageName,
  note: entry.description,
}))
const title = props.kind === 'plugin'
  ? '外掛'
  : '套件'
const lead = props.kind === 'plugin'
  ? '放在 RichEditor 裡面的功能，需要哪個就裝哪個。每頁都有實際的展示、安裝指令和使用的程式碼。'
  : '編輯器本體、唯讀呈現和周邊工具。每頁都有安裝指令和使用的程式碼。'
</script>

<template>
  <DocPage :crumbs="[{ label: '參考' }, { label: title }]" :title="title" :lead="lead" wide :toc="false">
    <TileGrid :tiles="tiles" tile-class="pkg-tile" min="260px" />
  </DocPage>
</template>
