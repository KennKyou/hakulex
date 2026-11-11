/**
 * Writes the file icons the code snippets use, taken from Material Icon Theme, into the
 * renderer: only the ones the maps in file-kind.ts name, so readers don't load the whole set.
 *
 *   node scripts/build-file-icons.mjs
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(root, 'packages/renderer/package.json'))
const pkgPath = require.resolve('@iconify-json/material-icon-theme/package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const set = JSON.parse(readFileSync(join(dirname(pkgPath), 'icons.json'), 'utf8'))
const info = JSON.parse(readFileSync(join(dirname(pkgPath), 'info.json'), 'utf8'))

// The names the maps use, read from the maps themselves, and the set's plain file for the rest.
const maps = readFileSync(join(root, 'packages/renderer/src/code-snippet/file-kind.ts'), 'utf8')
const names = new Set(['document'])
for (const block of maps.matchAll(/const (?:EXTENSION|LANGUAGE)_ICONS[^{]*\{([^}]*)\}/g)) {
  for (const [, name] of block[1].matchAll(/:\s*'([\w-]+)'/g))
    names.add(name)
}

const icons = {}
for (const name of [...names].sort()) {
  const icon = set.icons[name]
  if (!icon)
    throw new Error(`Material Icon Theme has no icon named ${name}`)
  icons[name] = {
    body: icon.body,
    left: icon.left ?? set.left ?? 0,
    top: icon.top ?? set.top ?? 0,
    width: icon.width ?? set.width ?? 16,
    height: icon.height ?? set.height ?? 16,
  }
}

const holder = info.author?.name ?? 'Material Extensions'
const out = `/*
 * File icons from ${info.name ?? 'Material Icon Theme'} (${info.author?.url ?? 'https://github.com/material-extensions/vscode-material-icon-theme'}),
 * taken from ${pkg.name}@${pkg.version}. Written by scripts/build-file-icons.mjs from the names
 * file-kind.ts uses; don't edit by hand.
 *
 * ${info.license?.spdx ?? pkg.license} License
 *
 * Copyright (c) ${holder}
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 * and associated documentation files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or
 * substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
 * BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 * DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

export const MATERIAL_ICONS: Record<string, { body: string, left: number, top: number, width: number, height: number }> = ${JSON.stringify(icons, null, 2)}
`
const target = join(root, 'packages/renderer/src/code-snippet/material-icons.ts')
writeFileSync(target, out)
// In the repository's own style, so writing it again changes nothing.
execFileSync(join(root, 'node_modules/.bin/eslint'), ['--fix', target], { stdio: 'inherit' })
console.log(`wrote ${Object.keys(icons).length} icons`)
