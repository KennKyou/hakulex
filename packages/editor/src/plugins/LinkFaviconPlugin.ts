import type { LexicalEditor, NodeKey } from 'lexical'
import { useLexicalRegister } from '@hakulex/vue-lexical'
import { AutoLinkNode, LinkNode } from '@lexical/link'
import { mergeRegister } from '@lexical/utils'
import { defineComponent } from 'vue'
import { faviconHost, findFavicon } from '../favicon'

/*
 * Each link shows its site's icon before its text: marked on the
 * link's element once found, and drawn by the editor's styles. Not part of the document.
 */

function mark(link: HTMLElement) {
  const href = link.getAttribute('href') ?? ''
  if (link.dataset.faviconHref === href)
    return
  link.dataset.faviconHref = href
  delete link.dataset.favicon
  link.style.removeProperty('--hlx-link-favicon')
  const host = faviconHost(href)
  if (!host)
    return
  void findFavicon(host).then((url) => {
    // The link may have moved on to another address meanwhile.
    if (!url || link.dataset.faviconHref !== href)
      return
    link.style.setProperty('--hlx-link-favicon', `url("${url}")`)
    link.dataset.favicon = 'loaded'
  })
}

function onMutations(editor: LexicalEditor) {
  return (mutations: Map<NodeKey, 'created' | 'updated' | 'destroyed'>) => {
    for (const [key, mutation] of mutations) {
      if (mutation === 'destroyed')
        continue
      const link = editor.getElementByKey(key)
      if (link)
        mark(link)
    }
  }
}

export const LinkFaviconPlugin = defineComponent({
  name: 'LinkFaviconPlugin',
  setup() {
    useLexicalRegister(editor => mergeRegister(
      editor.registerMutationListener(LinkNode, onMutations(editor)),
      editor.registerMutationListener(AutoLinkNode, onMutations(editor)),
    ))
    return () => null
  },
})
