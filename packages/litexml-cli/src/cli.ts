import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { run } from './run'

/* The `litexml` command: `run` with the real stdin, stdout, files and browser. */

process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE')
    process.exit(0)
  throw error
})

function openInBrowser(file: string): void {
  const resolved = path.resolve(file)
  const result = process.platform === 'darwin'
    ? spawnSync('open', [resolved], { stdio: 'ignore' })
    : process.platform === 'win32'
      ? spawnSync('cmd', ['/c', 'start', '', resolved], { stdio: 'ignore' })
      : spawnSync('xdg-open', [resolved], { stdio: 'ignore' })
  if (result.error || (typeof result.status === 'number' && result.status !== 0))
    throw new Error(`無法打開 ${resolved}。`)
}

const code = await run(process.argv.slice(2), {
  stdin: () => readFileSync(0, 'utf8'),
  stdout: text => process.stdout.write(text),
  stderr: text => process.stderr.write(text),
  exists: file => existsSync(file) && statSync(file).isFile(),
  readFile: file => readFileSync(file, 'utf8'),
  writeFile: (file, text) => writeFileSync(file, text),
  tempDir: () => mkdtempSync(path.join(tmpdir(), 'hakulex-litexml-')),
  open: openInBrowser,
})
process.exitCode = code
