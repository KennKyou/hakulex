import type { LexicalEditor, NodeKey } from 'lexical'
import type { ShallowRef } from 'vue'
import { shallowRef } from 'vue'

export interface FootnoteState {
  /** Display numbers, by first appearance in the document. */
  numbers: Map<string, number>
  /** The first reference to each note, which is the one with an id. */
  firstKeys: Map<string, NodeKey>
  /** Content, by identifier. */
  definitions: Map<string, string>
}

export interface FootnoteFocusRequest {
  identifier: string
  /** Where the caret goes back to afterwards. */
  refKey: NodeKey
}

interface FootnoteStore {
  state: ShallowRef<FootnoteState>
  /** A note whose input should take focus, which may not be on screen yet. */
  focus: ShallowRef<FootnoteFocusRequest | null>
}

const stores = new WeakMap<LexicalEditor, FootnoteStore>()

/** Per editor, since node keys and numbers are per editor. */
export function footnoteStore(editor: LexicalEditor): FootnoteStore {
  let store = stores.get(editor)
  if (!store) {
    store = {
      state: shallowRef({
        numbers: new Map(),
        firstKeys: new Map(),
        definitions: new Map(),
      }),
      focus: shallowRef(null),
    }
    stores.set(editor, store)
  }
  return store
}
