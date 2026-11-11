import type { UserConfig } from 'vite'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import vue from '@vitejs/plugin-vue'
import dts from 'unplugin-dts/vite'

export interface LibraryOptions {
  entry?: string | Record<string, string>
}

/**
 * Shared Vite library config for packages/*.
 * Externalizes vue plus every dependency / peerDependency so each package
 * ships only its own code. Output: ESM `.mjs` + `.d.ts` + a single `style.css`.
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
      }),
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
