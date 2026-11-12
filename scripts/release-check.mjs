/**
 * Checks the packages as someone installing them from npm would meet them. It builds and packs
 * every package, installs the packed files into a new project outside this repository, and then
 * looks at four things: the styles in a production build, rendering on a server in plain Node,
 * the types, and what publint says about each package.
 *
 *   pnpm release:check
 *
 * It publishes nothing and needs no npm login. `--keep` leaves the project it made for a look.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const keep = process.argv.includes('--keep')
const packages = readdirSync(join(root, 'packages'), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort()
const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const results = []
function step(name, run) {
  process.stdout.write(`• ${name} … `)
  try {
    const note = run()
    results.push({ name, ok: true })
    console.log(note
      ? `ok (${note})`
      : 'ok')
  }
  catch (error) {
    results.push({ name, ok: false })
    console.log('FAILED')
    const output = [error.stdout, error.stderr, error.message].filter(Boolean).map(String).join('\n')
    console.log(output.split('\n').slice(-30).map(line => `    ${line}`).join('\n'))
  }
}
function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    maxBuffer: 64 * 1024 * 1024,
  })
}
function must(condition, message) {
  if (!condition)
    throw new Error(message)
}

const work = mkdtempSync(join(tmpdir(), 'hakulex-release-check-'))
const packs = join(work, 'packs')
const app = join(work, 'app')
mkdirSync(packs)
mkdirSync(join(app, 'src'), { recursive: true })
console.log(`Working in ${work}\n`)

step('build the packages', () => {
  run('pnpm', ['build'], root)
})

const tarballs = {}
step(`pack ${packages.length} packages`, () => {
  for (const name of packages)
    run('pnpm', ['pack', '--pack-destination', packs], join(root, 'packages', name))
  for (const file of readdirSync(packs)) {
    const name = packages.find(pkg => file.startsWith(`hakulex-${pkg}-`) && /^\d/.test(file.slice(`hakulex-${pkg}-`.length)))
    must(name, `can't tell which package ${file} is`)
    tarballs[`@hakulex/${name}`] = join(packs, file)
  }
  must(Object.keys(tarballs).length === packages.length, `expected ${packages.length} packed files, found ${Object.keys(tarballs).length}`)
})

step('no built file imports a stylesheet outright', () => {
  // A dynamic import() is loaded only where the code asks for it; a plain one would break in Node.
  const offenders = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory())
        walk(path)
      else if (entry.name.endsWith('.mjs') && /^import\b[^()\n]*\.css['"]/m.test(readFileSync(path, 'utf8')))
        offenders.push(path.slice(root.length + 1))
    }
  }
  for (const name of packages)
    walk(join(root, 'packages', name, 'dist'))
  must(offenders.length === 0, `these import CSS: ${offenders.join(', ')}`)
})

const lexical = JSON.parse(readFileSync(join(root, 'packages/editor/package.json'), 'utf8')).peerDependencies.lexical
// A project of its own, outside this repository: the packed files, and the tools at the versions used here.
const dev = rootPkg.devDependencies
writeFileSync(join(app, 'package.json'), `${JSON.stringify({
  name: 'hakulex-release-check',
  private: true,
  type: 'module',
  dependencies: {
    ...Object.fromEntries(Object.entries(tarballs).map(([name, file]) => [name, `file:${file}`])),
    '@lexical/headless': lexical,
    '@vue/server-renderer': dev['@vue/server-renderer'],
    'lexical': lexical,
    'vue': dev.vue,
  },
  devDependencies: {
    '@vitejs/plugin-vue': dev['@vitejs/plugin-vue'],
    'publint': 'latest',
    'typescript': dev.typescript,
    'vite': dev.vite,
    'vue-tsc': dev['vue-tsc'],
  },
}, null, 2)}\n`)
// Packages name each other by version; here every one of them is the packed file.
writeFileSync(join(app, 'pnpm-workspace.yaml'), `overrides:\n${Object.entries(tarballs).map(([name, file]) => `  '${name}': 'file:${file}'`).join('\n')}\n`)
writeFileSync(join(app, 'index.html'), '<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>\n')
writeFileSync(join(app, 'vite.config.ts'), 'import vue from \'@vitejs/plugin-vue\'\nimport { defineConfig } from \'vite\'\n\nexport default defineConfig({ plugins: [vue()] })\n')
writeFileSync(join(app, 'tsconfig.json'), `${JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    strict: true,
    skipLibCheck: false,
    noEmit: true,
    jsx: 'preserve',
    lib: ['ESNext', 'DOM', 'DOM.Iterable'],
    types: ['vite/client'],
  },
  include: ['src/**/*.ts', 'src/**/*.vue'],
}, null, 2)}\n`)
// As the README says to: the styles once, where the app starts.
writeFileSync(join(app, 'src/main.ts'), [
  'import \'@hakulex/editor/style.css\'',
  'import \'@hakulex/plugin-toolbar/style.css\'',
  'import \'@hakulex/plugin-slash-menu/style.css\'',
  'import \'@hakulex/diff/style.css\'',
  'import { createApp } from \'vue\'',
  'import App from \'./App.vue\'',
  '',
  'createApp(App).mount(\'#app\')',
  '',
].join('\n'))
writeFileSync(join(app, 'src/App.vue'), `<script setup lang="ts">
import type { SerializedEditorState } from 'lexical'
import { RichDiff } from '@hakulex/diff'
import { RichEditor, validateUrl } from '@hakulex/editor'
import { SlashMenuPlugin } from '@hakulex/plugin-slash-menu'
import { ToolbarPlugin } from '@hakulex/plugin-toolbar'
import { RichRenderer } from '@hakulex/renderer'
import { shallowRef } from 'vue'

const doc = shallowRef<SerializedEditorState | null>(null)
</script>

<template>
  <RichEditor v-model="doc" placeholder="Write" variant="article" color-scheme="light">
    <template #toolbar>
      <ToolbarPlugin :validate-url="validateUrl" />
    </template>
    <SlashMenuPlugin />
  </RichEditor>
  <RichRenderer :value="doc" />
  <RichDiff v-if="doc" :old-value="doc" :new-value="doc" layout="inline" />
</template>
`)
// Plain Node, no bundler: what a server does with a stored document.
writeFileSync(join(app, 'ssr.mjs'), `import { $toMarkdown, allHeadlessNodes } from '@hakulex/headless'
import { createDefaultRegistry, deserializeFromXml, serializeToXml } from '@hakulex/litexml'
import { RichRenderer } from '@hakulex/renderer'
import { createHeadlessEditor } from '@lexical/headless'
import { renderToString } from '@vue/server-renderer'
import { createSSRApp, h } from 'vue'

const text = value => ({ type: 'text', version: 1, text: value, format: 0, style: '', mode: 'normal', detail: 0 })
const block = (type, children, more = {}) => ({ type, version: 1, format: '', indent: 0, direction: null, children, ...more })
const doc = { root: block('root', [
  block('heading', [text('Release check')], { tag: 'h2' }),
  block('paragraph', [text('Rendered in Node.')], { textFormat: 0, textStyle: '' }),
  { type: 'katex-block', version: 1, equation: 'a^2 + b^2 = c^2' },
]) }

const html = await renderToString(createSSRApp({ render: () => h(RichRenderer, { value: doc }) }))
if (!html.includes('Release check') || !/<h2[\\s>]/.test(html))
  throw new Error(\`unexpected HTML: \${html.slice(0, 300)}\`)

const registry = createDefaultRegistry()
const xml = serializeToXml(doc, registry)
if (deserializeFromXml(xml, registry).root.children.length < 2)
  throw new Error(\`LiteXML did not come back: \${xml}\`)

const editor = createHeadlessEditor({ nodes: allHeadlessNodes, onError: (error) => { throw error } })
const markdown = editor.parseEditorState(JSON.stringify(doc)).read(() => $toMarkdown())
if (!markdown.includes('## Release check'))
  throw new Error(\`unexpected Markdown: \${markdown}\`)

console.log(\`html \${html.length} chars, xml \${xml.length} chars, markdown \${markdown.length} chars\`)
`)

let installed = false
step('install the packed files into a new project', () => {
  run('pnpm', ['install'], app)
  installed = true
})

if (installed) {
  step('styles: a production build has the packages\' CSS', () => {
    run('pnpm', ['exec', 'vite', 'build'], app)
    const assets = join(app, 'dist/assets')
    const css = readdirSync(assets).filter(file => file.endsWith('.css')).map(file => readFileSync(join(assets, file), 'utf8')).join('\n')
    const wanted = {
      'design tokens': '--hlx-color-accent',
      'content': '.hlx-heading',
      'editor': '.hlx-editor-body',
      'toolbar plugin': '.hlx-fixed-toolbar-button',
      'slash menu plugin': '.hlx-slash-item',
      'comparison': '.hlx-diff',
    }
    const missing = Object.entries(wanted).filter(([, needle]) => !css.includes(needle)).map(([name]) => name)
    must(missing.length === 0, `the built CSS has nothing from: ${missing.join(', ')}`)
    return `${Math.round(css.length / 1024)} kB of CSS`
  })

  step('server: rendering, LiteXML and Markdown run in plain Node', () => run('node', ['ssr.mjs'], app).trim())

  step('types: vue-tsc in strict mode', () => {
    run('pnpm', [
      'exec',
      'vue-tsc',
      '--noEmit',
      '-p',
      'tsconfig.json',
    ], app)
  })

  step('publint on each installed package', () => {
    const problems = []
    for (const name of packages) {
      try {
        run('pnpm', [
          'exec',
          'publint',
          join('node_modules', '@hakulex', name),
          '--strict',
        ], app)
      }
      catch (error) {
        problems.push(`@hakulex/${name}\n${String(error.stdout ?? error.message).trim()}`)
      }
    }
    must(problems.length === 0, problems.join('\n\n'))
  })
}

if (keep)
  console.log(`\nKept: ${work}`)
else
  rmSync(work, { recursive: true, force: true })

const failed = results.filter(result => !result.ok)
console.log(failed.length
  ? `\n${failed.length} of ${results.length} checks failed: ${failed.map(result => result.name).join('; ')}`
  : `\nAll ${results.length} checks passed. Nothing was published.`)
process.exit(failed.length
  ? 1
  : 0)
