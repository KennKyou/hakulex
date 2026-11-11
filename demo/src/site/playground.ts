import type { SerializedEditorState } from 'lexical'
import { shallowRef } from 'vue'

/**
 * The playground's document. It lives outside the page, so it stays when the page is left and
 * opened again (/ and /editor), and the site around it can hand it to tests (App.vue).
 */
export const playgroundDoc = shallowRef<SerializedEditorState | null>()
