export { contentTheme } from './content-theme'

export type EditorVariant = 'article' | 'note' | 'comment' | 'chat'
export type ColorScheme = 'light' | 'dark'

/** Root class every hakulex surface carries; tokens are scoped to it. */
export const ROOT_CLASS = 'hlx-root'

/** Class on the element that directly contains the document's blocks. */
export const CONTENT_CLASS = 'hlx-content'
export type { EditorVariantName, ThemeTokens, TokenGroup } from './tokens'
export { HOSTED_TOKENS, themeStyle, TOKEN_GROUPS, tokenValues } from './tokens'
