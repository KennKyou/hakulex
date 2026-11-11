import type { HighlighterCore, LanguageRegistration, ThemedToken } from 'shiki/core'

type Loader = () => Promise<{ default: LanguageRegistration[] }>

// Explicit imports so bundlers can split each grammar into its own chunk.
const SHIKI_LANGUAGES: Record<string, [name: string, load: Loader]> = {
  ts: [
    'typescript',
    () => import('shiki/langs/typescript.mjs'),
  ],
  js: [
    'javascript',
    () => import('shiki/langs/javascript.mjs'),
  ],
  tsx: [
    'tsx',
    () => import('shiki/langs/tsx.mjs'),
  ],
  jsx: [
    'jsx',
    () => import('shiki/langs/jsx.mjs'),
  ],
  vue: [
    'vue',
    () => import('shiki/langs/vue.mjs'),
  ],
  html: [
    'html',
    () => import('shiki/langs/html.mjs'),
  ],
  css: [
    'css',
    () => import('shiki/langs/css.mjs'),
  ],
  scss: [
    'scss',
    () => import('shiki/langs/scss.mjs'),
  ],
  json: [
    'json',
    () => import('shiki/langs/json.mjs'),
  ],
  bash: [
    'shellscript',
    () => import('shiki/langs/shellscript.mjs'),
  ],
  python: [
    'python',
    () => import('shiki/langs/python.mjs'),
  ],
  go: [
    'go',
    () => import('shiki/langs/go.mjs'),
  ],
  rust: [
    'rust',
    () => import('shiki/langs/rust.mjs'),
  ],
  java: [
    'java',
    () => import('shiki/langs/java.mjs'),
  ],
  kotlin: [
    'kotlin',
    () => import('shiki/langs/kotlin.mjs'),
  ],
  swift: [
    'swift',
    () => import('shiki/langs/swift.mjs'),
  ],
  c: [
    'c',
    () => import('shiki/langs/c.mjs'),
  ],
  cpp: [
    'cpp',
    () => import('shiki/langs/cpp.mjs'),
  ],
  csharp: [
    'csharp',
    () => import('shiki/langs/csharp.mjs'),
  ],
  php: [
    'php',
    () => import('shiki/langs/php.mjs'),
  ],
  ruby: [
    'ruby',
    () => import('shiki/langs/ruby.mjs'),
  ],
  sql: [
    'sql',
    () => import('shiki/langs/sql.mjs'),
  ],
  yaml: [
    'yaml',
    () => import('shiki/langs/yaml.mjs'),
  ],
  toml: [
    'toml',
    () => import('shiki/langs/toml.mjs'),
  ],
  markdown: [
    'markdown',
    () => import('shiki/langs/markdown.mjs'),
  ],
  diff: [
    'diff',
    () => import('shiki/langs/diff.mjs'),
  ],
  dockerfile: [
    'dockerfile',
    () => import('shiki/langs/dockerfile.mjs'),
  ],
}

let highlighter: Promise<HighlighterCore> | null = null

function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, light, dark] = await Promise.all([
      import('shiki/core'),
      import('shiki/engine/javascript'),
      import('shiki/themes/github-light.mjs'),
      import('shiki/themes/github-dark.mjs'),
    ])
    return createHighlighterCore({
      themes: [light.default, dark.default],
      langs: [],
      engine: createJavaScriptRegexEngine(),
    })
  })()
  return highlighter
}

/** A highlighted token; `style` carries `--shiki-light` / `--shiki-dark` colors. */
export interface CodeToken {
  content: string
  style?: Record<string, string>
}

/**
 * Tokenizes `code` with Shiki, loading Shiki and the grammar on first use.
 * Returns null for languages without a grammar (render as plain text).
 * Client-only in practice: the view calls it after mount.
 */
export async function highlightCode(code: string, languageId: string): Promise<CodeToken[][] | null> {
  const entry = SHIKI_LANGUAGES[languageId]
  if (!entry)
    return null
  const [name, load] = entry
  const shiki = await getHighlighter()
  if (!shiki.getLoadedLanguages().includes(name))
    await shiki.loadLanguage((await load()).default)

  const { tokens } = shiki.codeToTokens(code, {
    lang: name,
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
  })
  return tokens.map(line => line.map((token: ThemedToken) => ({
    content: token.content,
    style: token.htmlStyle as Record<string, string> | undefined,
  })))
}
