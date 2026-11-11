import { readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

/*
 * The command as one file for Node. The hakulex packages are bundled in (their exports point at
 * .ts and .vue sources); the packages in `dependencies` stay outside and load from node_modules.
 */

const cwd = process.cwd()
const pkg = JSON.parse(readFileSync(path.resolve(cwd, 'package.json'), 'utf8'))
const dependencies = new Set(Object.keys(pkg.dependencies ?? {}))
const builtins = new Set(builtinModules)

function external(id: string): boolean {
  if (id.startsWith('node:') || builtins.has(id))
    return true
  if (id[0] === '.' || id[0] === '/' || id[0] === '\0')
    return false
  const parts = id.split('/')
  return dependencies.has(id[0] === '@'
    ? parts.slice(0, 2).join('/')
    : parts[0])
}

export default defineConfig({
  plugins: [
    vue(),
  ],
  build: {
    emptyOutDir: true,
    minify: false,
    outDir: 'dist',
    ssr: path.resolve(cwd, 'src/cli.ts'),
    target: 'node22',
    rollupOptions: {
      external,
      output: {
        banner: '#!/usr/bin/env node',
        entryFileNames: 'cli.mjs',
        format: 'es',
      },
    },
  },
  ssr: {
    noExternal: true,
    external: [...dependencies],
  },
})
