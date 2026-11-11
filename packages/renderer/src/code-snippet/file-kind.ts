import type { VNode } from 'vue'
import { h } from 'vue'
import { normalizeLanguage } from '../code/languages'
import { MATERIAL_ICONS } from './material-icons'

/*
 * File icons: Material Icon Theme's, by a file's language when it has one,
 * else by its extension. Only the icons these maps name are kept, in material-icons.ts, which
 * scripts/build-file-icons.mjs writes; run it after changing a map.
 */

// By extension. A name without a dot is its own extension: Dockerfile.
const EXTENSION_ICONS: Record<string, string> = {
  ts: 'typescript',
  tsx: 'react-ts',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'react',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'sass',
  sass: 'sass',
  less: 'sass',
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  md: 'markdown',
  mdx: 'markdown',
  sh: 'console',
  bash: 'console',
  zsh: 'console',
  yml: 'yaml',
  yaml: 'yaml',
  sql: 'database',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  rb: 'ruby',
  php: 'php',
  vue: 'vue',
  svelte: 'svelte',
  toml: 'toml',
  xml: 'xml',
  graphql: 'graphql',
  gql: 'graphql',
  dockerfile: 'docker',
  lua: 'lua',
  zig: 'zig',
  diff: 'diff',
  patch: 'diff',
}

// By the ids our language list uses.
const LANGUAGE_ICONS: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
  tsx: 'react-ts',
  jsx: 'react',
  vue: 'vue',
  html: 'html',
  css: 'css',
  scss: 'sass',
  json: 'json',
  bash: 'console',
  python: 'python',
  go: 'go',
  rust: 'rust',
  java: 'java',
  kotlin: 'kotlin',
  swift: 'swift',
  c: 'c',
  cpp: 'cpp',
  csharp: 'csharp',
  php: 'php',
  ruby: 'ruby',
  sql: 'database',
  yaml: 'yaml',
  toml: 'toml',
  markdown: 'markdown',
  diff: 'diff',
  dockerfile: 'docker',
}

/** The icon for a file: its language's, else its extension's, else a plain file. */
export function fileIconName(filename: string, language?: string): string {
  if (language) {
    const byLanguage = LANGUAGE_ICONS[normalizeLanguage(language).id]
    if (byLanguage)
      return byLanguage
  }
  const extension = filename.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_ICONS[extension] ?? 'file'
}

/** A file's icon, in its own colors; it says nothing to screen readers. */
export function fileIcon(filename: string, language?: string): VNode {
  const name = fileIconName(filename, language)
  // The set's plain file is called a document.
  const icon = MATERIAL_ICONS[name] ?? MATERIAL_ICONS.document
  return h('svg', {
    // Not hlx-file-icon: that is the file block's, which outlines its icons in the text's color.
    'class': 'hlx-code-file-icon',
    'data-icon': name,
    // Some icons are drawn away from the origin, and say where.
    'viewBox': `${icon.left} ${icon.top} ${icon.width} ${icon.height}`,
    'width': 14,
    'height': 14,
    'aria-hidden': 'true',
    'focusable': 'false',
    'innerHTML': icon.body,
  })
}
