// @vitest-environment node
import { createDefaultRegistry, deserializeFromXml } from '@hakulex/litexml'
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../src/formats/markdown'
import { run } from '../src/run'
import { fakeIO, SAMPLE_MARKDOWN, SAMPLE_XML } from './helpers'

/* --format markdown, and errors. */

const parse = (xml: string) => deserializeFromXml(xml, createDefaultRegistry())

describe('--format markdown', () => {
  it('gives the expected Markdown', async () => {
    const io = fakeIO()
    expect(await run([SAMPLE_XML, '--format', 'markdown'], io)).toBe(0)
    expect(io.out).toBe(`${SAMPLE_MARKDOWN}\n`)
    expect(io.err).toBe('')
  })

  it('gives an empty Markdown for an empty document', async () => {
    expect(renderMarkdown(parse('<doc></doc>'))).toBe('')
    const io = fakeIO()
    expect(await run(['<doc></doc>', '-f', 'markdown'], io)).toBe(0)
    expect(io.out).toBe('\n')
  })

  it('takes out nodes it doesn\'t know, keeping their text, and warns', async () => {
    const text = (value: string) => ({
      type: 'text',
      version: 1,
      text: value,
      format: 0,
      detail: 0,
      mode: 'normal',
      style: '',
    })
    const doc = {
      root: {
        type: 'root',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        children: [
          { type: 'future-block', version: 1 },
          {
            type: 'paragraph',
            version: 1,
            direction: null,
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
            children: [
              text('前'),
              {
                type: 'future-inline',
                version: 1,
                children: [
                  text('後'),
                ],
              },
            ],
          },
        ],
      },
    }
    const io = fakeIO()
    expect(await run([
      JSON.stringify(doc),
      '-f',
      'markdown',
    ], io)).toBe(0)
    expect(io.out).toBe('前後\n')
    expect(io.err).toBe('警告：Markdown 不包含這些不認得的節點：future-block、future-inline\n')
  })
})

describe('renderMarkdown', () => {
  const md = (xml: string) => renderMarkdown(parse(xml))

  it('renders paragraph text', () => {
    expect(md('<doc><p>Hello world</p></doc>')).toContain('Hello world')
  })

  it('renders headings as ATX', () => {
    expect(md('<doc><h1>Title</h1></doc>')).toContain('# Title')
    expect(md('<doc><h2>Sub</h2></doc>')).toContain('## Sub')
  })

  it('renders code blocks as fenced', () => {
    const out = md('<doc><codeblock lang="ts">const a = 1;</codeblock></doc>')
    expect(out).toContain('```')
    expect(out).toContain('const a = 1;')
  })

  it('renders unordered lists', () => {
    const out = md('<doc><ul><li>One</li><li>Two</li></ul></doc>')
    expect(out).toMatch(/[*-]\s+One/)
    expect(out).toMatch(/[*-]\s+Two/)
  })
})
