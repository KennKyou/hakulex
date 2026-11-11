import { normalizeLanguage } from './code/languages'

/** A file of a code snippet, ready to show. */
export interface SnippetFile {
  filename: string
  code: string
  language?: string
  highlightLines: Set<number>
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Stored content is untrusted: what isn't a file is left out. */
export function normalizeSnippetFiles(value: unknown): SnippetFile[] {
  if (!Array.isArray(value))
    return []
  return value.filter(isObject).flatMap(({ filename, code, language, highlightLines }) => (typeof filename === 'string' && typeof code === 'string'
    ? [
        {
          filename,
          code,
          language: typeof language === 'string'
            ? language
            : undefined,
          highlightLines: new Set(Array.isArray(highlightLines)
            ? highlightLines.filter(line => Number.isInteger(line) && line > 0) as number[]
            : []),
        },
      ]
    : []))
}

/** The stored language, or else what the file's extension says. */
export function snippetLanguage(file: Pick<SnippetFile, 'filename' | 'language'>): string {
  return normalizeLanguage(file.language ?? file.filename.split('.').pop()).id
}
