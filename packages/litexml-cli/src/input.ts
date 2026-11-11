import type { InputFormat } from './args'
import type { CliIO } from './run'

/** A file's content, stdin for "-" or nothing, and anything else is the content itself. */
export function readInput(input: string | undefined, io: CliIO): string {
  if (!input || input === '-')
    return io.stdin()
  if (io.exists(input))
    return io.readFile(input)
  return input
}

/** LiteXML starts with "<", JSON with "{". */
export function detectInputFormat(raw: string): InputFormat {
  const trimmed = raw.trim()
  if (!trimmed)
    throw new Error('輸入是空的。')
  if (trimmed[0] === '<')
    return 'litexml'
  if (trimmed[0] === '{')
    return 'json'
  throw new Error('無法判斷輸入的格式：內容的開頭應該是「<」（LiteXML）或「{」（JSON）。可以用 --input-format 指定。')
}
