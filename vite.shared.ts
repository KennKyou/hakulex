import type { Plugin, ResolvedConfig, UserConfig } from 'vite'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import vue from '@vitejs/plugin-vue'
import dts from 'unplugin-dts/vite'
import { preprocessCSS } from 'vite'

export interface LibraryOptions {
  entry?: string | Record<string, string>
}

/**
 * Writes a package's stylesheet to dist/style.css. A package's code does not import its styles:
 * whoever uses it imports `<package>/style.css`, so the code also runs where CSS cannot be
 * loaded, such as Node rendering on a server. The stylesheet is the file the package exports as
 * `./style.css`, with everything it `@import`s written into it.
 */
function packageStyles(cwd: string, source: string | undefined): Plugin {
  let config: ResolvedConfig
  return {
    name: 'hakulex-package-styles',
    apply: 'build',
    configResolved(resolved) {
      config = resolved
    },
    async generateBundle() {
      if (!source)
        return
      const file = path.resolve(cwd, source)
      const { code } = await preprocessCSS(readFileSync(file, 'utf8'), file, config)
      this.emitFile({ type: 'asset', fileName: 'style.css', source: code })
    },
  }
}

/**
 * Shared Vite library config for packages/*.
 * Externalizes vue plus every dependency / peerDependency so each package
 * ships only its own code. Output: ESM `.mjs` + `.d.ts`, and `style.css` if the package has styles.
 */
export function createLibraryConfig(options: LibraryOptions = {}): UserConfig {
  const { entry = 'src/index.ts' } = options
  const cwd = process.cwd()

  const isMap = typeof entry !== 'string'
  const libEntry = isMap
    ? Object.fromEntries(Object.entries(entry).map(([k, v]) => [
        k,
        path.resolve(cwd, v),
      ]))
    : path.resolve(cwd, entry)

  const pkg = JSON.parse(readFileSync(path.resolve(cwd, 'package.json'), 'utf8'))
  const styles: string | undefined = pkg.exports?.['./style.css']
  const depNames = new Set([
    'vue',
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ])

  const external = (id: string) => {
    if (id.startsWith('node:'))
      return true
    if (id[0] === '.' || id[0] === '/' || id[0] === '\0')
      return false
    const parts = id.split('/')
    const pkgName = id[0] === '@'
      ? parts.slice(0, 2).join('/')
      : parts[0]
    return depNames.has(pkgName)
  }

  return {
    plugins: [
      vue(),
      dts({
        entryRoot: 'src',
        outDir: 'dist',
        tsconfigPath: './tsconfig.json',
        processor: 'vue',
        // Maps from the types back to src would be published pointing at files that are not.
        compilerOptions: { declarationMap: false },
      }),
      packageStyles(cwd, styles),
    ],
    build: {
      lib: {
        entry: libEntry,
        formats: ['es'],
        fileName: isMap
          ? (_, name) => `${name}.mjs`
          : () => 'index.mjs',
        cssFileName: 'style',
      },
      rollupOptions: { external },
      cssCodeSplit: false,
      minify: false,
      target: 'es2022',
    },
  }
}
