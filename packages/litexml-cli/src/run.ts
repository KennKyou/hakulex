import type { SerializedEditorState } from 'lexical'
import type { CliOptions, InputFormat } from './args'
import { createDefaultRegistry, deserializeFromXml } from '@hakulex/litexml'
import { irrelevantOptions, parseArgs } from './args'
import { renderHtml } from './formats/html'
import { renderJson } from './formats/json'
import { renderMarkdown } from './formats/markdown'
import { HELP } from './help'
import { detectInputFormat, readInput } from './input'

/** What the command reads, writes and opens. `cli.ts` gives it the real ones. */
export interface CliIO {
  stdin: () => string
  stdout: (text: string) => void
  stderr: (text: string) => void
  exists: (path: string) => boolean
  readFile: (path: string) => string
  writeFile: (path: string, text: string) => void
  /** A new directory for a preview opened without -o. */
  tempDir: () => string
  /** Opens a file in the system's browser; throws if it can't. */
  open: (path: string) => void
}

function toEditorState(raw: string, forced: InputFormat | undefined): SerializedEditorState {
  const trimmed = raw.trim()
  if (!trimmed)
    throw new Error('輸入是空的。')
  const format = forced ?? detectInputFormat(trimmed)
  if (format === 'json') {
    try {
      return JSON.parse(trimmed) as SerializedEditorState
    }
    catch (error) {
      const message = error instanceof Error
        ? error.message
        : String(error)
      throw new Error(`JSON 有錯：${message}`, { cause: error })
    }
  }
  return deserializeFromXml(trimmed, createDefaultRegistry())
}

async function render(state: SerializedEditorState, options: CliOptions, io: CliIO): Promise<string> {
  switch (options.format) {
    case 'json':
      return renderJson(state, options.compact)
    case 'markdown':
      return renderMarkdown(state, types => io.stderr(`警告：Markdown 不包含這些不認得的節點：${types.join('、')}\n`))
    case 'html':
      return renderHtml(state, {
        lang: options.lang,
        theme: options.theme,
        title: options.title,
        variant: options.variant,
      }, options.input, io)
    default:
      throw new Error('缺少必要的選項：--format <html|json|markdown>。')
  }
}

/** Runs `litexml` with these arguments; gives the exit code. */
export async function run(argv: string[], io: CliIO): Promise<number> {
  try {
    const options = parseArgs(argv)
    if (options.help) {
      io.stdout(HELP)
      return 0
    }
    if (!options.format)
      throw new Error('缺少必要的選項：--format <html|json|markdown>。')
    const ignored = irrelevantOptions(options)
    if (ignored.length)
      io.stderr(`提醒：--format ${options.format} 用不到這些選項，已忽略：${ignored.join(', ')}\n`)

    const state = toEditorState(readInput(options.input, io), options.inputFormat)
    const rendered = `${await render(state, options, io)}\n`

    if (options.format === 'html' && options.open) {
      const target = options.output ?? `${io.tempDir()}/preview.html`
      io.writeFile(target, rendered)
      io.open(target)
      return 0
    }
    if (options.output)
      io.writeFile(options.output, rendered)
    else
      io.stdout(rendered)
    return 0
  }
  catch (error) {
    const message = error instanceof Error
      ? error.message
      : String(error)
    io.stderr(`litexml: ${message}\n\n${HELP}`)
    return 1
  }
}
