import type { StreamParser } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { StreamLanguage } from '@codemirror/language'

const legacy = (parser: StreamParser<unknown>) => StreamLanguage.define(parser)

// Explicit imports so bundlers split each language into its own chunk.
const LOADERS: Record<string, () => Promise<Extension>> = {
  ts: () => import('@codemirror/lang-javascript').then(m => m.javascript({ typescript: true })),
  js: () => import('@codemirror/lang-javascript').then(m => m.javascript()),
  tsx: () => import('@codemirror/lang-javascript').then(m => m.javascript({ typescript: true, jsx: true })),
  jsx: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: true })),
  vue: () => import('@codemirror/lang-vue').then(m => m.vue()),
  html: () => import('@codemirror/lang-html').then(m => m.html()),
  css: () => import('@codemirror/lang-css').then(m => m.css()),
  scss: () => import('@codemirror/lang-css').then(m => m.css()),
  json: () => import('@codemirror/lang-json').then(m => m.json()),
  bash: () => import('@codemirror/legacy-modes/mode/shell').then(m => legacy(m.shell)),
  python: () => import('@codemirror/lang-python').then(m => m.python()),
  go: () => import('@codemirror/lang-go').then(m => m.go()),
  rust: () => import('@codemirror/lang-rust').then(m => m.rust()),
  java: () => import('@codemirror/lang-java').then(m => m.java()),
  kotlin: () => import('@codemirror/legacy-modes/mode/clike').then(m => legacy(m.kotlin)),
  swift: () => import('@codemirror/legacy-modes/mode/swift').then(m => legacy(m.swift)),
  c: () => import('@codemirror/lang-cpp').then(m => m.cpp()),
  cpp: () => import('@codemirror/lang-cpp').then(m => m.cpp()),
  csharp: () => import('@codemirror/legacy-modes/mode/clike').then(m => legacy(m.csharp)),
  php: () => import('@codemirror/lang-php').then(m => m.php()),
  ruby: () => import('@codemirror/legacy-modes/mode/ruby').then(m => legacy(m.ruby)),
  sql: () => import('@codemirror/lang-sql').then(m => m.sql()),
  yaml: () => import('@codemirror/lang-yaml').then(m => m.yaml()),
  toml: () => import('@codemirror/legacy-modes/mode/toml').then(m => legacy(m.toml)),
  markdown: () => import('@codemirror/lang-markdown').then(m => m.markdown()),
  diff: () => import('@codemirror/legacy-modes/mode/diff').then(m => legacy(m.diff)),
  dockerfile: () => import('@codemirror/legacy-modes/mode/dockerfile').then(m => legacy(m.dockerFile)),
}

const cache = new Map<string, Promise<Extension>>()

/** CodeMirror language support for a normalized language id; empty for plain text. */
export function loadCodeMirrorLanguage(id: string): Promise<Extension> {
  const load = LOADERS[id]
  if (!load)
    return Promise.resolve([])
  let pending = cache.get(id)
  if (!pending) {
    pending = load()
    cache.set(id, pending)
  }
  return pending
}
