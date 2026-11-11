// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/* A server reads documents with this package, so it must not pull in Vue or the editor. */

const SRC = join(import.meta.dirname, '../src')

function imported(file: string): string[] {
  const source = readFileSync(join(SRC, file), 'utf8')
  return [
    ...source.matchAll(/(?:from|import)\s*(?:\(\s*)?'([^']+)'/g),
  ].map(match => match[1])
}

describe('what the package imports', () => {
  const files = readdirSync(SRC).filter(file => file.endsWith('.ts'))

  it('has source files', () => {
    expect(files).toContain('index.ts')
    expect(files).toContain('nodes.ts')
  })

  it.each(files)('%s imports neither Vue nor a hakulex package', (file) => {
    const modules = imported(file)
    expect(modules.filter(name => name === 'vue' || name.endsWith('.vue') || name.startsWith('@hakulex/') || name.startsWith('@vue/'))).toEqual([])
  })
})
