import type { Klass, LexicalEditor, LexicalNode } from 'lexical'
import type { Component } from 'vue'

export interface SlashMenuItem {
  /** Stable id; also used as the option's DOM id suffix. */
  key: string
  title: string
  description?: string
  /** Extra words matched by the query (English names, abbreviations, synonyms). */
  keywords?: string[]
  /** Group heading. Items keep their order; groups appear in first-seen order. */
  group?: string
  icon?: Component
  /** Hidden in editors that don't have these, such as the one inside a step. */
  requires?: Klass<LexicalNode>[]
  /**
   * Runs inside `editor.update()` after the `/query` text is removed, so `$`
   * helpers and `editor.dispatchCommand` both work.
   */
  run: (editor: LexicalEditor) => void
}
