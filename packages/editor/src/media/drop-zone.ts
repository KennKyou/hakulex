import type { LexicalEditor } from 'lexical'

const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false

/** Files dragged over the editor: show where they go, and never let the browser open them. */
function watchDrops(root: HTMLElement, attribute: string, canAccept: () => boolean) {
  let depth = 0
  const setMark = (on: boolean) => root.toggleAttribute(attribute, on)
  const onEnter = (event: DragEvent) => {
    if (!carriesFiles(event))
      return
    depth++
    setMark(canAccept())
  }
  const onOver = (event: DragEvent) => {
    if (carriesFiles(event))
      event.preventDefault()
  }
  const onLeave = () => {
    depth = Math.max(0, depth - 1)
    if (!depth)
      setMark(false)
  }
  const onDrop = (event: DragEvent) => {
    depth = 0
    setMark(false)
    if (carriesFiles(event))
      event.preventDefault()
  }
  root.addEventListener('dragenter', onEnter)
  root.addEventListener('dragover', onOver)
  root.addEventListener('dragleave', onLeave)
  root.addEventListener('drop', onDrop)
  return () => {
    setMark(false)
    root.removeEventListener('dragenter', onEnter)
    root.removeEventListener('dragover', onOver)
    root.removeEventListener('dragleave', onLeave)
    root.removeEventListener('drop', onDrop)
  }
}

/** Follows the editor's root element. `attribute` marks it while `canAccept` says yes. */
export function registerDropZone(editor: LexicalEditor, attribute: string, canAccept: () => boolean) {
  let unregister: (() => void) | undefined
  const unregisterRoot = editor.registerRootListener((root) => {
    unregister?.()
    unregister = root
      ? watchDrops(root, attribute, canAccept)
      : undefined
  })
  return () => {
    unregisterRoot()
    unregister?.()
  }
}
