import type { LexicalEditor } from 'lexical'

/** On the root while ⌘ (Ctrl) is held, so links show they can be opened. */
export const MOD_CLASS = 'hlx-link-mod'

/**
 * ⌘-click (Ctrl-click) opens a link in a new tab. Without
 * the key, a click puts the caret in the link as usual.
 */
export function registerModClick(editor: LexicalEditor): () => void {
  let unbind: (() => void) | null = null
  const unregister = editor.registerRootListener((root) => {
    unbind?.()
    unbind = root
      ? bind(root)
      : null
  })
  return () => {
    unregister()
    unbind?.()
  }
}

function bind(root: HTMLElement) {
  const isMod = (key: string) => key === 'Meta' || key === 'Control'
  const onKeyDown = (event: KeyboardEvent) => {
    if (isMod(event.key))
      root.classList.add(MOD_CLASS)
  }
  const onKeyUp = (event: KeyboardEvent) => {
    if (isMod(event.key))
      root.classList.remove(MOD_CLASS)
  }
  const onBlur = () => root.classList.remove(MOD_CLASS)
  const onClick = (event: MouseEvent) => {
    if (!(event.metaKey || event.ctrlKey))
      return
    const href = (event.target as Element | null)?.closest?.('a')?.getAttribute('href')
    if (!href)
      return
    event.preventDefault()
    window.open(href, '_blank', 'noopener,noreferrer')
  }
  root.addEventListener('keydown', onKeyDown)
  root.addEventListener('keyup', onKeyUp)
  root.addEventListener('blur', onBlur)
  root.addEventListener('click', onClick)
  return () => {
    root.removeEventListener('keydown', onKeyDown)
    root.removeEventListener('keyup', onKeyUp)
    root.removeEventListener('blur', onBlur)
    root.removeEventListener('click', onClick)
    root.classList.remove(MOD_CLASS)
  }
}
