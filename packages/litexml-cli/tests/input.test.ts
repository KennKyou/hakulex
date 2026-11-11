// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { detectInputFormat, readInput } from '../src/input'
import { run } from '../src/run'
import { fakeIO, SAMPLE_XML } from './helpers'

/* Where the input comes from and what it is. */

describe('detectInputFormat', () => {
  it('detects LiteXML by a leading "<"', () => {
    expect(detectInputFormat('<p>Hello</p>')).toBe('litexml')
    expect(detectInputFormat('  \n<doc></doc>')).toBe('litexml')
  })

  it('detects JSON by a leading "{"', () => {
    expect(detectInputFormat('{"root":{}}')).toBe('json')
    expect(detectInputFormat('  \n{"root":{}}')).toBe('json')
  })

  it('throws on empty input', () => {
    expect(() => detectInputFormat('')).toThrow('輸入是空的')
    expect(() => detectInputFormat('   \n\t')).toThrow('輸入是空的')
  })

  it('throws on input it can\'t tell', () => {
    expect(() => detectInputFormat('hello world')).toThrow('無法判斷輸入的格式')
    expect(() => detectInputFormat('[1,2,3]')).toThrow('--input-format')
  })
})

describe('readInput', () => {
  it('reads a file, stdin for "-" or nothing, and anything else as the content', () => {
    const io = fakeIO({
      stdin: '<doc>stdin</doc>',
      files: { 'post.xml': '<doc>file</doc>' },
    })
    expect(readInput('post.xml', io)).toBe('<doc>file</doc>')
    expect(readInput('-', io)).toBe('<doc>stdin</doc>')
    expect(readInput(undefined, io)).toBe('<doc>stdin</doc>')
    expect(readInput('<p>inline</p>', io)).toBe('<p>inline</p>')
  })
})

describe('reading input in the command', () => {
  const doc = {
    root: {
      type: 'root',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children: [],
    },
  }

  it('reads LiteXML from a file, stdin and the command line alike', async () => {
    const results: string[] = []
    for (const [argv, io] of [
      [
        ['post.xml'],
        fakeIO({
          files: { 'post.xml': SAMPLE_XML },
        }),
      ],
      [
        ['-'],
        fakeIO({ stdin: SAMPLE_XML }),
      ],
      [
        [SAMPLE_XML],
        fakeIO(),
      ],
    ] as const) {
      expect(await run([...argv, '--format', 'json'], io)).toBe(0)
      results.push(io.out)
    }
    expect(results[1]).toBe(results[0])
    expect(results[2]).toBe(results[0])
    expect(JSON.parse(results[0]).root.children[0].type).toBe('heading')
  })

  it('follows --input-format instead of guessing', async () => {
    const io = fakeIO()
    expect(await run([
      JSON.stringify(doc),
      '--format',
      'json',
      '--input-format',
      'litexml',
    ], io)).toBe(0)
    // Read as LiteXML, the JSON is text in a paragraph, not the document itself.
    expect(JSON.parse(io.out)).not.toEqual(doc)

    const asJson = fakeIO()
    expect(await run([
      JSON.stringify(doc),
      '-f',
      'json',
      '-i',
      'json',
    ], asJson)).toBe(0)
    expect(JSON.parse(asJson.out)).toEqual(doc)
  })

  it.each([
    ['empty input', '   ', '輸入是空的'],
    ['input it can\'t tell', 'hello', '無法判斷輸入的格式'],
    ['broken JSON', '{"root":', 'JSON 有錯：'],
  ])('fails on %s with the reason and the help', async (_name, input, reason) => {
    const io = fakeIO({ stdin: input })
    expect(await run(['-', '--format', 'json'], io)).toBe(1)
    expect(io.out).toBe('')
    expect(io.err.startsWith(`litexml: `)).toBe(true)
    expect(io.err).toContain(reason)
    expect(io.err).toContain('用法：')
  })
})
