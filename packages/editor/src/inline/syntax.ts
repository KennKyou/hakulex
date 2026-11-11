/**
 * Markdown for inline syntax, kept free of nodes so paste detection can use it.
 *
 * Stricter than the usual forms, since `|`, `^` and `~` all show up in ordinary text:
 * - a spoiler's content has no space at its edges, and no word or `|` right before it,
 *   which keeps `a || b || c` and `if (a||b||c)` as text;
 * - superscript and subscript have no spaces inside, and no digit right after them,
 *   which keeps `2^10 和 3^5` and `x^2+y^2` as text;
 * - subscript has no digit right before it either, which keeps `3~5，7~9` as text.
 */
const SPOILER = String.raw`(?<![\w|\\])\|\|(?=[^\s|])((?:\\.|[^|\\]|\|(?!\|))+?)(?<!\s)\|\|`
const SUPERSCRIPT = String.raw`(?<![\\^])\^((?:\\.|[^\s^\\])+)\^`
const SUBSCRIPT = String.raw`(?<![\\~\d])~((?:\\.|[^\s~\\])+)~`
const RP = String.raw`(?:<rp>[^<]*<\/rp>)*`
const RUBY = String.raw`<ruby>([^<]+)${RP}<rt>(\s*[^\s<][^<]*)<\/rt>${RP}<\/ruby>`

export const SPOILER_IMPORT = new RegExp(`${SPOILER}(?!\\|)`)
export const SUPERSCRIPT_IMPORT = new RegExp(`${SUPERSCRIPT}(?![\\^\\d])`)
export const SUPERSCRIPT_TYPED = new RegExp(`${SUPERSCRIPT}$`)
export const SUBSCRIPT_IMPORT = new RegExp(`${SUBSCRIPT}(?![~\\d])`)
export const SUBSCRIPT_TYPED = new RegExp(`${SUBSCRIPT}$`)
export const RUBY_IMPORT = new RegExp(RUBY, 'i')
export const TAG_IMPORT = /<tag>([^<]+)<\/tag>/
export const TAG_TYPED = /<tag>([^<]+)<\/tag>$/
export const COMMENT_IMPORT = /<!--(.+?)-->/
export const COMMENT_TYPED = /<!--(.+?)-->$/
export const MENTION_IMPORT = /(?:\[([^\]]+)\])?\{(\w+)@(\w[\w.-]*)\}/
export const MENTION_TYPED = /(?:\[([^\]]+)\])?\{(\w+)@(\w[\w.-]*)\}$/
