<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { RichEditor, validateUrl } from '@hakulex/editor'
import { FloatingToolbarPlugin } from '@hakulex/plugin-floating-toolbar'
import { SlashMenuPlugin } from '@hakulex/plugin-slash-menu'
import { ToolbarPlugin } from '@hakulex/plugin-toolbar'
import { shallowRef } from 'vue'
import DiffDemo from '../components/home/DiffDemo.vue'
import FeatureCell from '../components/home/FeatureCell.vue'
import HomeInstall from '../components/home/HomeInstall.vue'
import LiteXmlDemo from '../components/home/LiteXmlDemo.vue'
import PluginDemo from '../components/home/PluginDemo.vue'
import RenderDemo from '../components/home/RenderDemo.vue'
import SlashDemo from '../components/home/SlashDemo.vue'
import ThemeDemo from '../components/home/ThemeDemo.vue'
import GithubIcon from '../components/shell/GithubIcon.vue'
import LogoMark from '../components/shell/LogoMark.vue'
import { homeDocument, reasons, REPOSITORY } from '../site/home'
import { navGroups } from '../site/nav'
import { nodeCategories, nodeTypes } from '../site/nodes'
import { usePageMeta } from '../site/seo'
import { siteScheme } from '../site/theme'

/* What hakulex is, a piece of it to try, and the way to everything else. */
usePageMeta([])

const doc = shallowRef<SerializedEditorState | null>(homeDocument)
const YEAR = new Date().getFullYear()

const NODE_HINTS: Record<string, string> = {
  inline: '寫在一行文字裡',
  block: '自己佔一段',
  container: '裡面還能放其他內容',
}
const nodeGroups = nodeCategories.map(category => ({
  ...category,
  hint: NODE_HINTS[category.key],
  nodes: nodeTypes.filter(node => node.category === category.key),
}))
</script>

<template>
  <article class="home">
    <section class="home-hero">
      <div class="home-hero-text">
        <h1>一份文件，<br>從編輯到呈現</h1>
        <p class="home-lead">
          hakulex 是給 Vue 3 的富文本編輯器，建立在 Lexical 上。編輯和閱讀共用同一份文件，需要哪些功能就裝哪些外掛。
        </p>
        <div class="home-actions">
          <RouterLink to="/editor" class="home-button" data-primary>
            試用編輯器
            <svg class="home-button-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
          </RouterLink>
          <RouterLink to="/packages/editor" class="home-button">
            開始使用
          </RouterLink>
          <a :href="REPOSITORY" target="_blank" rel="noopener noreferrer" class="home-button" data-quiet>
            <GithubIcon />
            查看 GitHub
          </a>
        </div>
        <HomeInstall />
      </div>
      <div class="home-hero-editor">
        <!-- A window around it, with its toolbar, so it reads as an editor and not as a card of text. -->
        <div class="home-window">
          <div class="home-window-bar" aria-hidden="true">
            <span class="home-window-dots"><i /><i /><i /></span>
            <span class="home-window-title">可以直接編輯</span>
          </div>
          <RichEditor v-model="doc" :color-scheme="siteScheme" placeholder="開始輸入…">
            <template #toolbar>
              <ToolbarPlugin :validate-url="validateUrl" />
            </template>
            <FloatingToolbarPlugin :validate-url="validateUrl" />
            <SlashMenuPlugin />
          </RichEditor>
        </div>
      </div>
    </section>

    <section class="home-why" aria-labelledby="home-why-title">
      <h2 id="home-why-title">
        為什麼選 hakulex
      </h2>
      <div class="home-why-grid">
        <div v-for="reason in reasons" :key="reason.title" class="home-why-item">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <template v-if="reason.icon === 'vue'">
              <path d="M2 4h4l6 10 6-10h4L12 21Z" /><path d="M8 4l4 6.5L16 4" />
            </template>
            <template v-else-if="reason.icon === 'document'">
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" />
            </template>
            <template v-else-if="reason.icon === 'pieces'">
              <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M17.5 14v7M14 17.5h7" />
            </template>
            <template v-else>
              <path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6Z" /><path d="m9 12 2 2 4-4" />
            </template>
          </svg>
          <h3>{{ reason.title }}</h3>
          <p>{{ reason.text }}</p>
        </div>
      </div>
    </section>

    <header class="home-statement">
      <h2>寫作的體驗，放進你的 Vue 應用</h2>
      <p>打 Markdown 語法、按快捷鍵、貼上一整份 Markdown，都會直接變成排好的內容。</p>
    </header>
    <div class="home-grid">
      <FeatureCell title="斜線選單" description="在空白的一行打 /，表格、程式碼和圖表都能直接插入。">
        <SlashDemo />
      </FeatureCell>
      <FeatureCell title="不用編輯器也能呈現" description="這一格沒有載入編輯器，只用呈現元件把文件畫出來。">
        <RenderDemo />
      </FeatureCell>
      <FeatureCell title="文件比較" description="誰改了什麼，一眼看得出來：新增和刪掉的文字都標在原文裡。">
        <DiffDemo />
      </FeatureCell>
      <FeatureCell title="讓 AI 幫你改文件" description="文件可以轉成精簡的 LiteXML 交給 AI，它改完再讀回來，格式不會跑掉。">
        <LiteXmlDemo />
      </FeatureCell>
    </div>

    <header class="home-statement">
      <h2>需要什麼，就裝什麼</h2>
      <p>外掛各自獨立，樣式都能用自己的設計覆寫。</p>
    </header>
    <div class="home-grid">
      <FeatureCell class="home-tall" title="自由組合的外掛" description="打開或關掉一個外掛，編輯器馬上多出或少掉那個功能。">
        <PluginDemo />
      </FeatureCell>
      <FeatureCell class="home-tall" title="接上你的設計" description="用 token 覆寫顏色和字型，試著換一個強調色。">
        <ThemeDemo />
      </FeatureCell>
      <FeatureCell class="home-wide" :title="`${nodeTypes.length} 種節點`" description="公式、圖表、投票、對話、巢狀文件，每一種都能看、能編輯。">
        <!-- By kind, as the nodes section is: what sits in a line, what stands alone, what holds more. -->
        <div class="home-node-groups">
          <section v-for="group in nodeGroups" :key="group.key" class="home-node-group" :data-kind="group.key">
            <h4>
              {{ group.label }}
              <span>{{ group.nodes.length }}</span>
            </h4>
            <p>{{ group.hint }}</p>
            <div class="home-chips">
              <RouterLink v-for="node in group.nodes" :key="node.type" :to="`/nodes/${node.type}`">
                {{ node.label }}
              </RouterLink>
            </div>
          </section>
        </div>
      </FeatureCell>
    </div>

    <section class="home-cta">
      <h2>開始寫第一份文件</h2>
      <p>先在瀏覽器裡試，或直接裝進你的專案。</p>
      <div class="home-cta-actions">
        <RouterLink to="/editor" class="home-button" data-primary>
          試用編輯器
          <svg class="home-button-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
        </RouterLink>
        <RouterLink to="/packages/editor" class="home-button">
          開始使用
        </RouterLink>
      </div>
      <HomeInstall />
    </section>

    <footer class="home-footer">
      <!-- The mark's water, wide: rings going out from the corner, behind everything. -->
      <svg class="home-footer-ripples" viewBox="0 0 600 300" fill="none" aria-hidden="true">
        <ellipse v-for="ring in 7" :key="ring" cx="470" cy="300" :rx="ring * 62" :ry="ring * 24" :opacity="1 - ring * 0.12" />
      </svg>
      <div class="home-footer-main">
        <div class="home-footer-about">
          <strong class="home-footer-brand"><LogoMark :size="22" />hakulex</strong>
          <p>一份文件，從編輯到呈現。</p>
          <a class="home-footer-github" :href="REPOSITORY" target="_blank" rel="noopener noreferrer">
            <GithubIcon :size="14" />
            GitHub
          </a>
        </div>
        <nav v-for="group in navGroups" :key="group.label" :aria-label="group.label">
          <strong>{{ group.label }}</strong>
          <RouterLink v-for="section in group.sections" :key="section.path" :to="section.path">
            {{ section.label }}
          </RouterLink>
        </nav>
      </div>
      <div class="home-footer-end">
        <span>© {{ YEAR }} hakulex</span>
        <span class="home-footer-legal">
          <a :href="`${REPOSITORY}/blob/main/NOTICE`" target="_blank" rel="noopener noreferrer">致謝</a>
          <a :href="`${REPOSITORY}/blob/main/LICENSE`" target="_blank" rel="noopener noreferrer">MIT 授權</a>
        </span>
      </div>
    </footer>
  </article>
</template>

<style scoped>
.home {
  box-sizing: border-box;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  border-right: 1px solid var(--hlx-color-border);
  border-left: 1px solid var(--hlx-color-border);
}

.home > * {
  border-top: 1px solid var(--hlx-color-border);
}

.home-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  min-height: 640px;
}

.home-hero-text {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 64px 40px;
}

h1 {
  margin: 0;
  color: var(--hlx-color-text);
  font-size: 60px;
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.03em;
}

.home-lead {
  margin: 24px 0 0;
  color: var(--hlx-color-text-secondary);
  font-size: 18px;
  line-height: 1.7;
}

.home-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 32px 0 48px;
}

.home-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 20px;
  border: 1px solid var(--hlx-color-border);
  border-radius: 10px;
  background: var(--hlx-color-bg);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
  color: var(--hlx-color-text);
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  transition: transform 120ms ease-out, box-shadow 120ms ease-out, border-color 120ms ease-out, background-color 120ms ease-out;
}

.home-button:hover {
  border-color: var(--hlx-color-text-tertiary);
  box-shadow: 0 2px 4px rgb(0 0 0 / 0.06), 0 6px 16px rgb(0 0 0 / 0.08);
  transform: translateY(-1px);
}

.home-button:active {
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
  transform: none;
}

.home-button:focus-visible {
  outline: 2px solid var(--hlx-color-accent);
  outline-offset: 2px;
}

/* The one to press: the accent, lit from above, with a glow of its own color. */
.home-button[data-primary] {
  border-color: color-mix(in oklab, var(--hlx-color-accent) 85%, black);
  background: linear-gradient(180deg, color-mix(in oklab, var(--hlx-color-accent) 86%, white), var(--hlx-color-accent));
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.25), 0 1px 2px rgb(0 0 0 / 0.1), 0 6px 18px color-mix(in oklab, var(--hlx-color-accent) 32%, transparent);
  color: var(--hlx-color-bg);
}

.home-button[data-primary]:hover {
  border-color: color-mix(in oklab, var(--hlx-color-accent) 85%, black);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.25), 0 2px 4px rgb(0 0 0 / 0.12), 0 10px 26px color-mix(in oklab, var(--hlx-color-accent) 42%, transparent);
}

.home-button-arrow {
  transition: transform 120ms ease-out;
}

.home-button:hover .home-button-arrow {
  transform: translateX(3px);
}

/* A link more than a button: no frame until it is pointed at. */
.home-button[data-quiet] {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
  color: var(--hlx-color-text-secondary);
}

.home-button[data-quiet]:hover {
  border-color: transparent;
  background: var(--hlx-color-fill-secondary);
  box-shadow: none;
  color: var(--hlx-color-text);
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  .home-button,
  .home-button-arrow {
    transition: none;
  }

  .home-button:hover,
  .home-button:hover .home-button-arrow {
    transform: none;
  }
}

.home-hero-editor {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 40px;
  border-left: 1px solid var(--hlx-color-border);
  background: var(--hlx-color-bg-secondary);
  /* A press on the space around the window would otherwise put the caret in the editor. */
  user-select: none;
}

.home-window {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--hlx-color-border);
  border-radius: 12px;
  background: var(--hlx-color-bg);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.04), 0 12px 32px rgb(0 0 0 / 0.08);
}

.home-window-bar {
  position: relative;
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 14px;
  border-bottom: 1px solid var(--hlx-color-border);
  background: var(--hlx-color-bg-secondary);
}

.home-window-dots {
  display: flex;
  gap: 6px;
}

.home-window-dots i {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--hlx-color-fill);
}

.home-window-title {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--hlx-color-text-tertiary);
  font-size: 12px;
}

/* The toolbar stays; the document scrolls under it when it grows. */
.home-window :deep(.hlx-editor) {
  user-select: text;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.home-window :deep(.hlx-fixed-toolbar) {
  position: static;
  flex: none;
  margin: 0;
  padding: 6px 10px;
}

.home-window :deep(.hlx-content) {
  min-height: 300px;
  max-height: 420px;
  overflow-y: auto;
  padding: 20px 24px 24px;
}

/* Four reasons in a row, ruled like the feature grid below. */
.home-why h2 {
  margin: 0;
  padding: 20px 40px;
  border-bottom: 1px solid var(--hlx-color-border);
  color: var(--hlx-color-text-tertiary);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.04em;
}

.home-why-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.home-why-item {
  padding: 28px 28px 32px;
}

.home-why-item + .home-why-item {
  border-left: 1px solid var(--hlx-color-border);
}

.home-why-item:first-child {
  padding-left: 40px;
}

.home-why-item svg {
  color: var(--hlx-color-accent);
}

.home-why-item h3 {
  margin: 14px 0 0;
  color: var(--hlx-color-text);
  font-size: 16px;
  font-weight: 600;
}

.home-why-item p {
  margin: 8px 0 0;
  color: var(--hlx-color-text-secondary);
  font-size: 14px;
  line-height: 1.7;
}

@media (max-width: 959px) {
  .home-why-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .home-why-item:nth-child(odd) {
    border-left: 0;
    padding-left: 40px;
  }

  .home-why-item:nth-child(n + 3) {
    border-top: 1px solid var(--hlx-color-border);
  }
}

@media (max-width: 767px) {
  .home-why h2 {
    padding: 16px;
  }

  .home-why-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .home-why-item,
  .home-why-item:first-child,
  .home-why-item:nth-child(odd) {
    padding: 24px 16px;
    border-left: 0;
  }

  .home-why-item + .home-why-item {
    border-top: 1px solid var(--hlx-color-border);
  }
}

.home-statement {
  padding: 96px 40px;
  text-align: center;
}

.home-statement h2,
.home-cta h2 {
  margin: 0;
  color: var(--hlx-color-text);
  font-size: 40px;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.02em;
}

.home-statement p {
  margin: 16px 0 0;
  color: var(--hlx-color-text-secondary);
  font-size: 18px;
}

.home-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.home-grid > :nth-child(odd) {
  border-right: 1px solid var(--hlx-color-border);
}

.home-grid > :nth-child(n + 3) {
  border-top: 1px solid var(--hlx-color-border);
}

/* A demo with more to show than the others: it takes the height it needs. */
.home-tall :deep(.feature-demo) {
  max-height: none;
}

.home-wide {
  grid-column: 1 / -1;
  border-right: 0 !important;
}

/* A list to read through, not a demo in a window: it takes the height it needs. */
.home-wide :deep(.feature-demo) {
  max-height: none;
}

.home-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.home-chips a {
  padding: 4px 12px;
  border: 1px solid var(--hlx-color-border);
  border-radius: 999px;
  background: var(--hlx-color-bg);
  color: var(--hlx-color-text-secondary);
  font-size: 13px;
  text-decoration: none;
}

.home-chips a:hover {
  border-color: var(--hlx-color-accent);
  color: var(--hlx-color-text);
}

/* Three kinds side by side, the middle one widest as it has the most. */
.home-node-groups {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr);
  gap: 24px 32px;
}

.home-node-group h4 {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  color: var(--hlx-color-text);
  font-size: 14px;
  font-weight: 600;
}

.home-node-group h4 span {
  color: var(--hlx-color-text-tertiary);
  font-size: 12px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}

.home-node-group p {
  margin: 2px 0 12px;
  color: var(--hlx-color-text-tertiary);
  font-size: 12px;
}

@media (max-width: 767px) {
  .home-node-groups {
    grid-template-columns: minmax(0, 1fr);
  }
}

.home-cta {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 96px 40px;
}

.home-cta p {
  margin: 16px 0 0;
  color: var(--hlx-color-text-secondary);
  font-size: 18px;
  text-align: center;
}

.home-cta-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin: 32px 0;
}

/* The install box, as wide here as it is in the hero. */
.home-cta :deep(.home-install) {
  width: 100%;
}

.home-footer {
  position: relative;
  overflow: hidden;
  color: var(--hlx-color-text-secondary);
  font-size: 14px;
}

.home-footer-ripples {
  position: absolute;
  right: 0;
  bottom: 0;
  width: min(100%, 720px);
  pointer-events: none;
  stroke: var(--hlx-color-accent);
  stroke-width: 1.5;
  opacity: 0.22;
}

.home-footer-main {
  position: relative;
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 32px;
  padding: 56px 40px 48px;
}

.home-footer strong {
  display: block;
  margin-bottom: 12px;
  color: var(--hlx-color-text);
}

.home-footer p {
  margin: 0 0 16px;
}

.home-footer nav {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.home-footer a {
  color: inherit;
  text-decoration: none;
}

.home-footer a:hover {
  color: var(--hlx-color-text);
}

.home-footer-legal {
  display: flex;
  gap: 20px;
}

.home-footer-end {
  position: relative;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 40px;
  border-top: 1px solid var(--hlx-color-border);
  font-size: 13px;
}

@media (max-width: 899px) {
  .home-hero,
  .home-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .home-hero-editor {
    border-top: 1px solid var(--hlx-color-border);
    border-left: 0;
  }

  .home-grid > :nth-child(odd) {
    border-right: 0;
  }

  .home-grid > :nth-child(n + 2) {
    border-top: 1px solid var(--hlx-color-border);
  }
}

@media (max-width: 767px) {
  .home-hero-text {
    padding: 40px 16px;
  }

  .home-hero-editor {
    padding: 16px;
  }

  h1 {
    font-size: 40px;
  }

  .home-statement,
  .home-cta {
    padding: 56px 16px;
  }

  .home-statement h2,
  .home-cta h2 {
    font-size: 28px;
  }

  .home-footer-main {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: 36px 16px 32px;
  }

  .home-footer-about {
    grid-column: 1 / -1;
  }

  .home-footer-end {
    padding: 14px 16px;
  }
}

.home-footer .home-footer-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
}

.home-footer-github {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
