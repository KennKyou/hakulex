import type { Plugin } from 'vite'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import vue from '@vitejs/plugin-vue'
import { defineConfig, runnerImport } from 'vite'

/*
 * Workspace packages are served from source, so Vite discovers their deps only
 * after first load and re-bundles mid-session (two copies of lexical, reloads).
 * Pre-bundle them up front. `pkg > dep` resolves deps the demo doesn't list
 * itself, which pnpm's strict node_modules would otherwise hide.
 */
const WORKSPACE = [
  'vue-lexical',
  'renderer',
  'editor',
  'plugin-floating-toolbar',
  'plugin-mention',
  'plugin-slash-menu',
  'plugin-table',
  'plugin-block-handle',
  'plugin-toolbar',
]

// Lazily imported subpaths a package.json can't tell us about.
const DYNAMIC: Record<string, string[]> = {
  editor: [
    'shell',
    'clike',
    'swift',
    'ruby',
    'toml',
    'diff',
    'dockerfile',
  ]
    .map(mode => `@codemirror/legacy-modes/mode/${mode}`),
  renderer: [
    'pele/lazy',
    'shiki/core',
    'shiki/engine/javascript',
    'shiki/themes/github-light.mjs',
    'shiki/themes/github-dark.mjs',
    ...[
      'typescript',
      'javascript',
      'tsx',
      'jsx',
      'vue',
      'html',
      'css',
      'scss',
      'json',
      'shellscript',
      'python',
      'go',
      'rust',
      'java',
      'kotlin',
      'swift',
      'c',
      'cpp',
      'csharp',
      'php',
      'ruby',
      'sql',
      'yaml',
      'toml',
      'markdown',
      'diff',
      'dockerfile',
    ]
      .map(lang => `shiki/langs/${lang}.mjs`),
  ],
}
// Only ever imported through subpaths above; the root entry is the full bundle.
const SKIP = new Set(['shiki', 'pele', '@codemirror/legacy-modes'])

function prebundleEntries(dir: string): string[] {
  const pkg = JSON.parse(readFileSync(new URL(`../packages/${dir}/package.json`, import.meta.url), 'utf8'))
  const deps = Object.keys(pkg.dependencies ?? {}).filter(dep => !dep.startsWith('@hakulex/') && !SKIP.has(dep))
  return [
    ...deps,
    ...(DYNAMIC[dir] ?? []),
  ].map(dep => `@hakulex/${dir} > ${dep}`)
}

/**
 * Stands in for an application's upload service, in memory and only while developing:
 * `POST /__uploads/<name>` keeps a file, `GET` serves it back. Downloads are attachments,
 * which is what a real service should do so uploaded HTML can't run on this origin.
 */
function devUploads(): Plugin {
  const stored = new Map<string, { type: string, body: Buffer }>()
  return {
    name: 'hakulex-demo-uploads',
    configureServer(server) {
      server.middlewares.use('/__uploads', (req, res) => {
        const path = (req.url ?? '').split('?')[0]
        if (req.method === 'POST') {
          const chunks: Buffer[] = []
          req.on('data', chunk => chunks.push(chunk))
          req.on('end', () => {
            stored.set(path, {
              type: req.headers['content-type'] ?? 'application/octet-stream',
              body: Buffer.concat(chunks),
            })
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ src: `/__uploads${path}` }))
          })
          return
        }
        const file = stored.get(path)
        if (!file) {
          res.statusCode = 404
          res.end()
          return
        }
        res.setHeader('content-type', file.type)
        if (!file.type.startsWith('video/'))
          res.setHeader('content-disposition', 'attachment')
        res.end(file.body)
      })
    },
  }
}

/**
 * Writes sitemap.xml into the build from the site's own list of pages, so the two cannot drift.
 * The list is the app's TypeScript, loaded here the way Vite loads a config.
 */
function sitemap(): Plugin {
  return {
    name: 'hakulex-demo-sitemap',
    apply: 'build',
    async generateBundle() {
      const options = { configFile: false as const, logLevel: 'silent' as const }
      const { module: pages } = await runnerImport<typeof import('./src/site/pages')>(new URL('./src/site/pages.ts', import.meta.url).pathname, options)
      const { module: seo } = await runnerImport<typeof import('./src/site/seo')>(new URL('./src/site/seo.ts', import.meta.url).pathname, options)
      const urls = pages.sitePaths().map(path => `  <url><loc>${seo.pageUrl(path)}</loc></url>`)
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
      })
    },
  }
}

export default defineConfig({
  plugins: [
    vue(),
    devUploads(),
    sitemap(),
  ],
  resolve: {
    // Lexical keeps editor state in module scope; two copies break `$` helpers.
    dedupe: ['vue', 'lexical'],
  },
  optimizeDeps: {
    include: [
      'lexical',
      ...WORKSPACE.flatMap(prebundleEntries),
    ],
  },
  server: { port: 5199 },
})
