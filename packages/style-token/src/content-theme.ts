/**
 * Class names for document content, shared by the editor (as Lexical's
 * EditorThemeClasses) and the read-only renderer. Styled in `content.css`.
 */
export const contentTheme = {
  paragraph: 'hlx-paragraph',
  heading: {
    h1: 'hlx-heading hlx-h1',
    h2: 'hlx-heading hlx-h2',
    h3: 'hlx-heading hlx-h3',
    h4: 'hlx-heading hlx-h4',
    h5: 'hlx-heading hlx-h5',
    h6: 'hlx-heading hlx-h6',
  },
  quote: 'hlx-quote',
  quoteAttribution: 'hlx-quote-attribution',
  tag: 'hlx-tag',
  mention: 'hlx-mention',
  table: 'hlx-table',
  tableCell: 'hlx-table-cell',
  tableCellHeader: 'hlx-table-cell-header',
  tableScrollableWrapper: 'hlx-table-wrap',
  link: 'hlx-link',
  list: {
    ul: 'hlx-list hlx-ul',
    ol: 'hlx-list hlx-ol',
    checklist: 'hlx-list hlx-checklist',
    listitem: 'hlx-listitem',
    listitemChecked: 'hlx-listitem-checked',
    listitemUnchecked: 'hlx-listitem-unchecked',
    nested: { listitem: 'hlx-listitem-nested' },
  },
  text: {
    bold: 'hlx-bold',
    italic: 'hlx-italic',
    underline: 'hlx-underline',
    strikethrough: 'hlx-strikethrough',
    underlineStrikethrough: 'hlx-underline-strikethrough',
    code: 'hlx-code',
    highlight: 'hlx-highlight',
    subscript: 'hlx-subscript',
    superscript: 'hlx-superscript',
  },
} as const
