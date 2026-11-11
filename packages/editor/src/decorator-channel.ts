import type { LexicalEditor, NodeKey } from 'lexical'

export interface DecoratorChannel<T> {
  /**
   * Component side: handle requests for `key`. A request made before the
   * component mounted is delivered right away. Returns the unregister function.
   */
  register: (editor: LexicalEditor, key: NodeKey, handler: (payload: T) => void) => () => void
  /** Plugin side: deliver now, or as soon as the node's component mounts. */
  request: (editor: LexicalEditor, key: NodeKey, payload: T) => void
}

/**
 * Lets commands talk to a decorator's component, e.g. "focus the code editor"
 * or "open the equation popover" for a node that was just inserted and whose
 * component doesn't exist yet. Keyed by editor: node keys are per editor.
 */
export function createDecoratorChannel<T>(): DecoratorChannel<T> {
  const handlers = new WeakMap<LexicalEditor, Map<NodeKey, (payload: T) => void>>()
  const pending = new WeakMap<LexicalEditor, Map<NodeKey, T>>()

  const mapFor = <V>(store: WeakMap<LexicalEditor, Map<NodeKey, V>>, editor: LexicalEditor) => {
    let map = store.get(editor)
    if (!map) {
      map = new Map()
      store.set(editor, map)
    }
    return map
  }

  return {
    register(editor, key, handler) {
      const byKey = mapFor(handlers, editor)
      byKey.set(key, handler)
      const waiting = pending.get(editor)
      if (waiting?.has(key)) {
        const payload = waiting.get(key) as T
        waiting.delete(key)
        handler(payload)
      }
      return () => {
        if (byKey.get(key) === handler)
          byKey.delete(key)
      }
    },
    request(editor, key, payload) {
      const handler = handlers.get(editor)?.get(key)
      if (handler)
        handler(payload)
      else
        mapFor(pending, editor).set(key, payload)
    },
  }
}
