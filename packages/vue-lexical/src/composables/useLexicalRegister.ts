import type { LexicalEditor } from 'lexical'
import { onBeforeUnmount, onMounted, watchEffect } from 'vue'
import { useLexicalComposer } from '../composer'

/**
 * Registers editor listeners for the lifetime of the component.
 * Runs on mount (never during SSR) and calls the returned cleanup on unmount.
 * Reactive values read synchronously inside `register` re-run the registration.
 */
export function useLexicalRegister(register: (editor: LexicalEditor) => () => void): void {
  const editor = useLexicalComposer()
  let stop: (() => void) | undefined

  onMounted(() => {
    stop = watchEffect(onCleanup => onCleanup(register(editor)))
  })
  onBeforeUnmount(() => {
    stop?.()
    stop = undefined
  })
}
