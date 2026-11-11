import type { KatexOptions } from 'katex'

type KaTeX = typeof import('katex').default

let katex: Promise<KaTeX> | null = null

/** Loads KaTeX's JS once. Works on the server too (no DOM needed). */
export function loadKatex(): Promise<KaTeX> {
  katex ??= import('katex').then(m => m.default)
  return katex
}

let stylesheet: Promise<unknown> | null = null

/** Loads KaTeX's CSS and fonts; browser only, bundled as its own chunk. */
export function loadKatexStyles(): Promise<unknown> {
  stylesheet ??= import('katex/dist/katex.min.css')
  return stylesheet
}

const OPTIONS: KatexOptions = {
  throwOnError: false,
  // MathML alongside the visual HTML, for screen readers.
  output: 'htmlAndMathml',
  // Stored content is untrusted: no \href, \includegraphics, \htmlClass...
  trust: false,
  strict: 'ignore',
}

/** KaTeX HTML for one equation. Errors render inline (red source), never throw. */
export function renderMathToString(lib: KaTeX, equation: string, displayMode: boolean): string {
  return lib.renderToString(equation, { ...OPTIONS, displayMode })
}

/** Cache key for an equation in a given mode. */
export function mathKey(equation: string, displayMode: boolean): string {
  return `${displayMode ? 'block' : 'inline'}:${equation}`
}
