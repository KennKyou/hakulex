// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseArgs } from '../src/args'
import { HELP } from '../src/help'
import { run } from '../src/run'
import { fakeIO } from './helpers'

/* Options. */

describe('parseArgs', () => {
  it('reads every option, short and long', () => {
    expect(parseArgs([
      'in.xml',
      '-f',
      'html',
      '-i',
      'litexml',
      '-o',
      'out.html',
      '--theme',
      'dark',
      '--variant',
      'note',
      '--title',
      'T',
      '--lang',
      'en',
      '--open',
    ])).toEqual({
      compact: false,
      format: 'html',
      help: false,
      input: 'in.xml',
      inputFormat: 'litexml',
      lang: 'en',
      open: true,
      output: 'out.html',
      theme: 'dark',
      title: 'T',
      variant: 'note',
    })
  })

  it('has its defaults, with zh-Hant for the language', () => {
    expect(parseArgs(['--format', 'json', '--compact'])).toEqual({
      compact: true,
      format: 'json',
      help: false,
      lang: 'zh-Hant',
      open: false,
      theme: 'light',
      variant: 'article',
    })
  })

  it('takes "-" as the input', () => {
    expect(parseArgs(['-', '-f', 'json']).input).toBe('-')
  })
})

describe('errors in options', () => {
  it.each([
    [
      ['in.xml'],
      '缺少必要的選項：--format <html|json|markdown>。',
    ],
    [
      ['in.xml', '--format', 'pdf'],
      '--format 必須是 html、json 或 markdown。',
    ],
    [
      [
        'in.xml',
        '-f',
        'html',
        '--theme',
        'blue',
      ],
      '--theme 必須是 light 或 dark。',
    ],
    [
      [
        'in.xml',
        '-f',
        'html',
        '--variant',
        'x',
      ],
      '--variant 必須是 article、note 或 comment。',
    ],
    [
      [
        'in.xml',
        '-f',
        'json',
        '--input-format',
        'yaml',
      ],
      '--input-format 必須是 litexml 或 json。',
    ],
    [
      ['in.xml', '-f'],
      '-f 缺少值。',
    ],
    [
      ['in.xml', '-f', 'html', '--title'],
      '--title 缺少值。',
    ],
    [
      ['in.xml', '-f', 'json', '--foo'],
      '不認得的選項：--foo。',
    ],
    [
      ['a.xml', 'b.xml', '-f', 'json'],
      '只能有一個輸入。',
    ],
  ])('%j fails with its reason', async (argv, reason) => {
    const io = fakeIO({
      files: { 'in.xml': '<doc></doc>', 'a.xml': '<doc></doc>', 'b.xml': '<doc></doc>' },
    })
    expect(await run(argv, io)).toBe(1)
    expect(io.out).toBe('')
    expect(io.err).toBe(`litexml: ${reason}\n\n${HELP}`)
  })

  it('prints the help for -h and --help', async () => {
    for (const flag of ['-h', '--help']) {
      const io = fakeIO()
      expect(await run([flag], io)).toBe(0)
      expect(io.out).toBe(HELP)
      expect(io.err).toBe('')
    }
    expect(HELP).toContain('用法：')
    expect(HELP).toContain('--format <格式>')
  })
})

describe('options a format doesn\'t use', () => {
  it('warns about them and goes on', async () => {
    const io = fakeIO()
    expect(await run([
      '<doc><p>x</p></doc>',
      '--format',
      'markdown',
      '--compact',
      '--theme',
      'dark',
      '--title',
      'T',
      '--open',
    ], io)).toBe(0)
    expect(io.err).toBe('提醒：--format markdown 用不到這些選項，已忽略：--compact, --theme, --title, --open\n')
    expect(io.out).toBe('x\n')
    expect(io.opened).toEqual([])
  })

  it('warns about html options with json', async () => {
    const io = fakeIO()
    expect(await run([
      '<doc></doc>',
      '-f',
      'json',
      '--variant',
      'note',
      '--lang',
      'en',
    ], io)).toBe(0)
    expect(io.err).toBe('提醒：--format json 用不到這些選項，已忽略：--variant, --lang\n')
  })
})
