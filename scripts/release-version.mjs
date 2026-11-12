/**
 * Gives every package the same version. The packages are released together, so that any two
 * of them at one version are known to work with each other.
 *
 *   pnpm release:version 0.2.0
 *
 * It changes the version line of each package.json and nothing else: no commit, no publishing.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const version = process.argv[2]
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?$/i.test(version)) {
  console.error('usage: pnpm release:version <version>, for example 0.2.0 or 0.2.0-beta.1')
  process.exit(1)
}

const packagesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages')
const changed = []
for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory())
    continue
  const file = join(packagesDir, entry.name, 'package.json')
  const text = readFileSync(file, 'utf8')
  const next = text.replace(/^(\s*"version":\s*")[^"]*(")/m, `$1${version}$2`)
  if (next === text && !text.includes(`"version": "${version}"`))
    throw new Error(`${file} has no version line`)
  if (next !== text) {
    writeFileSync(file, next)
    changed.push(entry.name)
  }
}
console.log(changed.length
  ? `${changed.length} packages are now at ${version}.`
  : `Every package was already at ${version}.`)
