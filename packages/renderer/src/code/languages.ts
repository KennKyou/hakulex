export interface CodeLanguage {
  /** Stored in the document (`language` field). */
  id: string
  label: string
  /** Other names that normalize to `id` (markdown fence info, legacy values). */
  aliases?: string[]
}

/** Languages offered in the editor; any other value renders as plain text. */
export const CODE_LANGUAGES: CodeLanguage[] = [
  {
    id: 'plaintext',
    label: 'Plain text',
    aliases: ['text', 'txt', 'plain', ''],
  },
  {
    id: 'ts',
    label: 'TypeScript',
    aliases: ['typescript', 'mts', 'cts'],
  },
  {
    id: 'js',
    label: 'JavaScript',
    aliases: ['javascript', 'mjs', 'cjs'],
  },
  { id: 'tsx', label: 'TSX' },
  { id: 'jsx', label: 'JSX' },
  { id: 'vue', label: 'Vue' },
  {
    id: 'html',
    label: 'HTML',
    aliases: ['xml', 'svg'],
  },
  { id: 'css', label: 'CSS' },
  {
    id: 'scss',
    label: 'SCSS',
    aliases: ['sass'],
  },
  {
    id: 'json',
    label: 'JSON',
    aliases: ['jsonc', 'json5'],
  },
  {
    id: 'bash',
    label: 'Bash',
    aliases: [
      'sh',
      'shell',
      'zsh',
      'shellscript',
      'console',
    ],
  },
  {
    id: 'python',
    label: 'Python',
    aliases: ['py'],
  },
  {
    id: 'go',
    label: 'Go',
    aliases: ['golang'],
  },
  {
    id: 'rust',
    label: 'Rust',
    aliases: ['rs'],
  },
  { id: 'java', label: 'Java' },
  {
    id: 'kotlin',
    label: 'Kotlin',
    aliases: ['kt'],
  },
  { id: 'swift', label: 'Swift' },
  {
    id: 'c',
    label: 'C',
    aliases: ['h'],
  },
  {
    id: 'cpp',
    label: 'C++',
    aliases: ['c++', 'cc', 'hpp'],
  },
  {
    id: 'csharp',
    label: 'C#',
    aliases: ['cs', 'c#'],
  },
  { id: 'php', label: 'PHP' },
  {
    id: 'ruby',
    label: 'Ruby',
    aliases: ['rb'],
  },
  { id: 'sql', label: 'SQL' },
  {
    id: 'yaml',
    label: 'YAML',
    aliases: ['yml'],
  },
  { id: 'toml', label: 'TOML' },
  {
    id: 'markdown',
    label: 'Markdown',
    aliases: ['md'],
  },
  {
    id: 'diff',
    label: 'Diff',
    aliases: ['patch'],
  },
  {
    id: 'dockerfile',
    label: 'Dockerfile',
    aliases: ['docker'],
  },
]

const BY_NAME = new Map<string, CodeLanguage>()
for (const language of CODE_LANGUAGES) {
  for (const name of [
    language.id,
    ...(language.aliases ?? []),
  ])
    BY_NAME.set(name, language)
}

/** Maps any name or alias (case-insensitive) to a known language; unknown → plaintext. */
export function normalizeLanguage(name: string | null | undefined): CodeLanguage {
  return BY_NAME.get((name ?? '').trim().toLowerCase()) ?? CODE_LANGUAGES[0]
}
