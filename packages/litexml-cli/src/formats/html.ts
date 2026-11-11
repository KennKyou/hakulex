import type { SerializedDocument } from '@hakulex/renderer'
import type { SerializedEditorState } from 'lexical'
import type { Theme, Variant } from '../args'
import type { CliIO } from '../run'
import { prerenderDocument, RichRenderer } from '@hakulex/renderer'
import { renderToString } from '@vue/server-renderer'
import { createSSRApp, h } from 'vue'
import { pageAssets } from './assets'

export interface HtmlOptions {
  lang: string
  theme: Theme
  title?: string
  variant: Variant
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function defaultTitle(inputHint: string | undefined, io: CliIO): string {
  if (inputHint && inputHint !== '-' && io.exists(inputHint))
    return inputHint.split(/[/\\]/).pop()!
  return 'LiteXML 預覽'
}

/** The page around the document: centred, at most 880px wide. */
const PAGE_CSS = `
body {
  margin: 0;
  max-width: 100%;
  overflow-x: clip;
  background: var(--hlx-color-bg);
}

.hlx-litexml-page {
  box-sizing: border-box;
  width: 100%;
  max-width: 880px;
  margin: 0 auto;
  overflow-x: clip;
  padding: 48px 24px 64px;
}

.hlx-litexml-page > .hlx-root {
  min-width: 0;
  max-width: 100%;
}

@media (max-width: 640px) {
  .hlx-litexml-page {
    padding: 28px 16px 48px;
  }
}
`

/**
 * The document as a page that needs no JavaScript: `RichRenderer` rendered on the server, with
 * math and diagrams worked out first, and the styles in the page.
 */
export async function renderHtml(state: SerializedEditorState, options: HtmlOptions, inputHint: string | undefined, io: CliIO): Promise<string> {
  const doc = state as unknown as SerializedDocument
  const prerendered = await prerenderDocument(doc)
  const app = createSSRApp({
    render: () => h(RichRenderer, {
      value: doc,
      variant: options.variant,
      colorScheme: options.theme,
      prerendered,
    }),
  })
  const content = await renderToString(app)
  const hasMath = Object.keys(prerendered.math ?? {}).length > 0
  const title = escapeHtml(options.title ?? defaultTitle(inputHint, io))
  const styles = pageAssets()

  return `<!doctype html>
<html lang="${escapeHtml(options.lang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="${options.theme}">
  <title>${title}</title>
  <style>
${styles.content}
${hasMath ? styles.katex : ''}
html {
  color-scheme: ${options.theme};
  max-width: 100%;
  overflow-x: clip;
}
${PAGE_CSS}
  </style>
</head>
<body class="hlx-root" data-color-scheme="${options.theme}" data-variant="${options.variant}">
  <main class="hlx-litexml-page">${content}</main>
</body>
</html>`
}
