import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

/*
 * The styles a page carries: hakulex's tokens and content styles, and KaTeX's with its fonts in
 * the page as woff2 data URLs, so the page loads nothing. The build reads them once and writes
 * them into the command (`__HAKULEX_PAGE_ASSETS__`, see vite.config.ts); without a build, as in
 * the tests, they are read here from the packages themselves.
 */

export interface PageAssets {
  /** @hakulex/style-token's tokens and content styles. */
  content: string
  /** KaTeX's styles, each font only as a woff2 data URL. */
  katex: string
}

/** A stylesheet with its `@import './x.css'` lines replaced by those files. */
function inlineImports(file: string): string {
  return readFileSync(file, 'utf8').replace(/@import\s+'(\.[^']+)';?/g, (_whole, relative: string) => inlineImports(path.resolve(path.dirname(file), relative)))
}

/** Reads the styles from the installed packages. */
export function loadPageAssets(from: string = import.meta.url): PageAssets {
  const require = createRequire(from)
  const katexFile = require.resolve('katex/dist/katex.min.css')
  const fonts = path.join(path.dirname(katexFile), 'fonts')
  const katex = readFileSync(katexFile, 'utf8').replace(
    /src:url\(fonts\/([\w-]+)\.woff2\) format\("woff2"\)(?:,url\(fonts\/[\w.-]+\) format\("\w+"\))*/g,
    (_whole, name: string) => `src:url(data:font/woff2;base64,${readFileSync(path.join(fonts, `${name}.woff2`)).toString('base64')}) format("woff2")`,
  )
  return {
    content: inlineImports(require.resolve('@hakulex/style-token/style.css')),
    katex,
  }
}

let assets: PageAssets | undefined

/** The page's styles: those the build put in, or read now. */
export function pageAssets(): PageAssets {
  assets ??= typeof __HAKULEX_PAGE_ASSETS__ !== 'undefined'
    ? __HAKULEX_PAGE_ASSETS__
    : loadPageAssets()
  return assets
}
