/* The command's options. */

export type OutputFormat = 'html' | 'json' | 'markdown'
export type InputFormat = 'litexml' | 'json'
export type Theme = 'light' | 'dark'
export type Variant = 'article' | 'note' | 'comment'

export interface CliOptions {
  compact: boolean
  format?: OutputFormat
  help: boolean
  input?: string
  inputFormat?: InputFormat
  lang: string
  open: boolean
  output?: string
  theme: Theme
  title?: string
  variant: Variant
}

function oneOf<const T extends string>(value: string | undefined, allowed: readonly T[], message: string): T {
  if (!allowed.includes(value as T))
    throw new Error(message)
  return value as T
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    compact: false,
    help: false,
    lang: 'zh-Hant',
    open: false,
    theme: 'light',
    variant: 'article',
  }

  const valueOf = (index: number): string => {
    const value = args[index + 1]
    if (!value)
      throw new Error(`${args[index]} 缺少值。`)
    return value
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    switch (arg) {
      case '-f':
      case '--format':
        options.format = oneOf(valueOf(i), ['html', 'json', 'markdown'], '--format 必須是 html、json 或 markdown。')
        i += 1
        break
      case '-i':
      case '--input-format':
        options.inputFormat = oneOf(valueOf(i), ['litexml', 'json'], '--input-format 必須是 litexml 或 json。')
        i += 1
        break
      case '-o':
      case '--output':
        options.output = valueOf(i)
        i += 1
        break
      case '--compact':
        options.compact = true
        break
      case '--theme':
        options.theme = oneOf(args[i + 1], ['light', 'dark'], '--theme 必須是 light 或 dark。')
        i += 1
        break
      case '--variant':
        options.variant = oneOf(args[i + 1], ['article', 'note', 'comment'], '--variant 必須是 article、note 或 comment。')
        i += 1
        break
      case '--title':
        options.title = valueOf(i)
        i += 1
        break
      case '--lang':
        options.lang = valueOf(i)
        i += 1
        break
      case '--open':
        options.open = true
        break
      case '-h':
      case '--help':
        options.help = true
        break
      default:
        if (arg.startsWith('-') && arg !== '-')
          throw new Error(`不認得的選項：${arg}。`)
        if (options.input !== undefined)
          throw new Error('只能有一個輸入。')
        options.input = arg
    }
  }
  return options
}

/** The options given that the chosen format doesn't use. */
export function irrelevantOptions(options: CliOptions): string[] {
  const irrelevant: string[] = []
  if (options.format !== 'json' && options.compact)
    irrelevant.push('--compact')
  if (options.format !== 'html') {
    if (options.theme !== 'light')
      irrelevant.push('--theme')
    if (options.variant !== 'article')
      irrelevant.push('--variant')
    if (options.title !== undefined)
      irrelevant.push('--title')
    if (options.lang !== 'zh-Hant')
      irrelevant.push('--lang')
    if (options.open)
      irrelevant.push('--open')
  }
  return irrelevant
}
