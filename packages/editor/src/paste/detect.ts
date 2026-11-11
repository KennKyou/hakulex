import { MENTION_PLATFORMS } from '@hakulex/renderer'
import { FOOTNOTE_DEFINITION_SYNTAX, FOOTNOTE_REFERENCE_SYNTAX } from '../footnote/transformers'
import { RUBY_IMPORT, SPOILER_IMPORT, SUBSCRIPT_IMPORT, SUPERSCRIPT_IMPORT, TAG_IMPORT } from '../inline/syntax'

import { FILE_SYNTAX, VIDEO_SYNTAX } from '../media/transformers'

/** One of these is enough: they rarely appear in ordinary prose. */
const STRONG_SIGNALS = [
  TAG_IMPORT,
  /^#{1,6}\s+\S/m,
  /^`{3,}/m,
  /!\[[^\]]*\]\([^)]+\)/,
  // Only real targets, so `arr[i](x)` in prose or code stays text.
  /(?<![\w\])])\[[^\]]+\]\((?:https?:|mailto:|\/|#)[^)]*\)/,
  /^\s*[*-]\s+\[[ x]\]/im,
  // Two list items in a row, optionally a blank line apart.
  /^[ \t]*[*+-][ \t]+\S.*\n(?:[ \t]*\n)?[ \t]*[*+-][ \t]+\S/m,
  /^[ \t]*\d+\.[ \t]+\S.*\n(?:[ \t]*\n)?[ \t]*\d+\.[ \t]+\S/m,
  // Callouts: a GitHub alert, or a container that has its closing line.
  /^>\s*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/im,
  /^:::\s*\w.*\n[\s\S]*^:::\s*$/m,
  // A table row followed by its divider.
  /^\s*\|.+\|[\t\v\f\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*\n\s*\|(?:\s*:?-+:?\s*\|)+\s*$/m,
  RUBY_IMPORT,
  FOOTNOTE_DEFINITION_SYNTAX,
  VIDEO_SYNTAX,
  FILE_SYNTAX,
  // Only the platforms we know: `{a@b}` is also what code looks like.
  new RegExp(`\\{(?:${Object.keys(MENTION_PLATFORMS).join('|')})@\\w[\\w.-]*\\}`),
]

/** Common in ordinary text too, so two different kinds are required. */
const WEAK_SIGNALS = [
  /\*\*\S(?:.*?\S)?\*\*/,
  /(?<![*\w])\*(?![*\s])[^*\n]*[^*\s]\*(?![*\w])/,
  /^\s*[*+-]\s+\S/m,
  /^\s*\d+\.\s+\S/m,
  /^>\s+\S/m,
  /`[^`\n]+`/,
  /^(?:-{3,}|\*{3,}|_{3,})\s*$/m,
  FOOTNOTE_REFERENCE_SYNTAX,
  SPOILER_IMPORT,
  SUPERSCRIPT_IMPORT,
  SUBSCRIPT_IMPORT,
  /(?<![\w+])\+\+\S(?:.*?\S)?\+\+(?![\w+])/,
]

/** A wrong "yes" rewrites the author's text; a wrong "no" only leaves it plain. */
export function isMarkdown(text: string): boolean {
  if (STRONG_SIGNALS.some(signal => signal.test(text)))
    return true
  return WEAK_SIGNALS.filter(signal => signal.test(text)).length >= 2
}

const RICH_TAGS = '[data-hlx-mention],[data-hlx-tag],.hlx-tag,strong,em,b,i,h1,h2,h3,h4,h5,h6,ul,ol,table,img,blockquote,pre>code,a[href],ruby,sub,sup,u,[data-hlx-spoiler],.hlx-spoiler,[data-hlx-footnote],[data-hlx-footnotes],video,[data-hlx-file]'

/** Whether HTML carries formatting worth keeping. VS Code's markup is only styled spans. */
export function hasRichHtml(html: string): boolean {
  if (!html || /data-vscode|vscode-/i.test(html))
    return false
  return new DOMParser().parseFromString(html, 'text/html').body.querySelector(RICH_TAGS) !== null
}

/** The language VS Code puts on the clipboard, or `null` when it isn't VS Code. */
export function vscodeLanguage(data: string): string | null {
  if (!data)
    return null
  try {
    const parsed: unknown = JSON.parse(data)
    return typeof parsed === 'object' && parsed !== null && 'mode' in parsed && typeof parsed.mode === 'string'
      ? parsed.mode
      : 'plaintext'
  }
  catch {
    return null
  }
}
