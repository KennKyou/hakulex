import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

/** Colors come from --hlx-syntax-* tokens, so light / dark follow the editor theme. */
const highlightStyle = HighlightStyle.define([
  {
    tag: [
      t.keyword,
      t.modifier,
      t.controlKeyword,
      t.operatorKeyword,
    ],
    color: 'var(--hlx-syntax-keyword)',
  },
  {
    tag: [
      t.string,
      t.special(t.string),
      t.regexp,
    ],
    color: 'var(--hlx-syntax-string)',
  },
  {
    tag: [t.comment, t.meta],
    color: 'var(--hlx-syntax-comment)',
    fontStyle: 'italic',
  },
  {
    tag: [
      t.number,
      t.bool,
      t.null,
      t.atom,
      t.constant(t.name),
    ],
    color: 'var(--hlx-syntax-constant)',
  },
  {
    tag: [
      t.function(t.variableName),
      t.function(t.propertyName),
    ],
    color: 'var(--hlx-syntax-function)',
  },
  {
    tag: [t.typeName, t.className, t.namespace],
    color: 'var(--hlx-syntax-type)',
  },
  {
    tag: [t.tagName, t.heading],
    color: 'var(--hlx-syntax-tag)',
  },
  {
    tag: [
      t.attributeName,
      t.propertyName,
      t.definition(t.propertyName),
    ],
    color: 'var(--hlx-syntax-attribute)',
  },
  {
    tag: [t.inserted],
    color: 'var(--hlx-syntax-tag)',
  },
  {
    tag: [t.deleted, t.invalid],
    color: 'var(--hlx-syntax-keyword)',
  },
  { tag: t.strong, fontWeight: '600' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.link, textDecoration: 'underline' },
])

const theme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: 'var(--hlx-color-text)',
    fontSize: '0.875em',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--hlx-font-mono)',
    lineHeight: '1.6',
  },
  '.cm-content': {
    padding: '12px 0',
    caretColor: 'var(--hlx-color-text)',
  },
  '.cm-line': { padding: '0 16px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--hlx-color-text)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--hlx-color-accent) 25%, transparent)',
  },
})

export const codeMirrorTheme = [
  theme,
  syntaxHighlighting(highlightStyle),
]
