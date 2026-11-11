import type { MaybeRefOrGetter } from 'vue'
import { toValue, watchEffect } from 'vue'
import { useRoute } from 'vue-router'

/*
 * Each page's title and description, for search results and shared links. index.html carries
 * the home page's; a page sets its own while it is shown, and the next page sets its own in turn.
 */

export const SITE_NAME = 'hakulex'
/** Where the site lives. Search engines and shared links are given addresses under it. */
export const SITE_URL = 'https://hakulex.dev'
export const HOME_TITLE = 'hakulex｜給 Vue 3 的富文本編輯器'
export const HOME_DESCRIPTION = 'hakulex 是建立在 Lexical 上的 Vue 3 富文本編輯器。編輯和閱讀共用同一份 JSON，可在伺服器端輸出；內建表格、程式碼、圖表、公式、投票等節點，外掛可以自由組合。'

function setMeta(selector: string, content: string) {
  document.head.querySelector<HTMLMetaElement>(selector)?.setAttribute('content', content)
}

/** A page's one address: the site, then its path without a query or a slash left at the end. */
export function pageUrl(path: string) {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '')
  return `${SITE_URL}${clean || '/'}`
}

/** A page's own title, such as `['圖表', '節點']`, becomes `圖表｜節點｜hakulex`. None is the home page's. */
export function usePageMeta(parts: MaybeRefOrGetter<string[]>, description?: MaybeRefOrGetter<string | undefined>) {
  const route = useRoute()
  watchEffect(() => {
    const names = toValue(parts).filter(Boolean)
    const title = names.length
      ? [...names, SITE_NAME].join('｜')
      : HOME_TITLE
    const text = toValue(description)?.trim() || HOME_DESCRIPTION
    document.title = title
    setMeta('meta[name="description"]', text)
    setMeta('meta[property="og:title"]', title)
    setMeta('meta[property="og:description"]', text)
    const url = pageUrl(route.path)
    document.head.querySelector('link[rel="canonical"]')?.setAttribute('href', url)
    setMeta('meta[property="og:url"]', url)
  })
}
