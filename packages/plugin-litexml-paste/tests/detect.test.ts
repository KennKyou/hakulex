import { describe, expect, it } from 'vitest'

import { detectLiteXml, parseLiteXmlSerializedNodes } from '../src/detect'

describe('liteXML import detection', () => {
  it('detects custom LiteXML fragments', () => {
    expect(detectLiteXml('<poll><question>Pick one</question></poll>')).toBe(true)
    expect(detectLiteXml('<grid cols="2"><cell><p>A</p></cell></grid>')).toBe(true)
    expect(detectLiteXml('<codeblock lang="ts">const x = 1</codeblock>')).toBe(true)
    expect(detectLiteXml('<mention platform="github" handle="octocat">Octocat</mention>')).toBe(true)
  })

  it('does not classify ordinary Markdown as LiteXML', () => {
    expect(detectLiteXml('![Alt](/image.png)')).toBe(false)
    expect(detectLiteXml('[hakulex](https://example.com)')).toBe(false)
    expect(detectLiteXml('```ts\nconst x = 1\n```')).toBe(false)
  })
})

describe('liteXML serialized node import', () => {
  it('parses a poll fragment through the default LiteXML registry', () => {
    const nodes = parseLiteXmlSerializedNodes(
      '<poll poll-id="p_abc" mode="multiple"><question>Pick one</question><option id="o_a">A</option><option id="o_b">B</option></poll>',
    )

    expect(nodes).toHaveLength(1)
    expect(nodes?.[0]).toMatchObject({
      type: 'poll',
      pollId: 'p_abc',
      mode: 'multiple',
      question: 'Pick one',
      options: [
        { id: 'o_a', label: 'A' },
        { id: 'o_b', label: 'B' },
      ],
    })
  })

  it('parses nested block fragments', () => {
    const nodes = parseLiteXmlSerializedNodes(
      '<banner type="tip"><p>Tip <mention platform="github" handle="octocat">Octocat</mention></p></banner>',
    )

    expect(nodes).toHaveLength(1)
    expect(nodes?.[0]).toMatchObject({
      type: 'banner',
      bannerType: 'tip',
    })
    expect((nodes?.[0] as any).content.root.children[0].children[1]).toMatchObject({
      type: 'mention',
      platform: 'github',
      handle: 'octocat',
      displayName: 'Octocat',
    })
  })

  it('parses kebab-case custom tags', () => {
    const nodes = parseLiteXmlSerializedNodes(
      '<code-snippet><file name="index.ts" lang="ts">export {}</file></code-snippet>',
    )

    expect(nodes).toHaveLength(1)
    expect(nodes?.[0]).toMatchObject({
      type: 'code-snippet',
      files: [
        { filename: 'index.ts', language: 'ts', code: 'export {}' },
      ],
    })
  })
})

describe('what is not LiteXML', () => {
  it('leaves HTML and text with angle brackets alone', () => {
    expect(detectLiteXml('<div>hi</div>')).toBe(false)
    expect(detectLiteXml('a < b && c > d')).toBe(false)
    expect(detectLiteXml('<section><span>x</span></section>')).toBe(false)
    expect(parseLiteXmlSerializedNodes('<div>hi</div>')).toBeNull()
  })
})

// LiteXML's <ruby> keeps its reading in an `rt` attribute; <rt> and <rp> elements are HTML's.
describe('ruby written as HTML', () => {
  it('is not LiteXML, so Markdown paste reads it as before', () => {
    expect(detectLiteXml('甲<ruby>漢字<rt>hàn</rt></ruby>乙')).toBe(false)
    expect(detectLiteXml('<ruby>漢<rt>hàn</rt></ruby>')).toBe(false)
    expect(detectLiteXml('<ruby>漢<rp>(</rp><rt>hàn</rt><rp>)</rp></ruby>')).toBe(false)
    expect(detectLiteXml('甲<ruby>漢字<RT>hàn</RT></ruby>乙')).toBe(false)
    expect(parseLiteXmlSerializedNodes('<ruby>漢<rt>hàn</rt></ruby>')).toBeNull()
  })

  it('leaves LiteXML\'s own ruby, and other LiteXML, to LiteXML', () => {
    expect(detectLiteXml('<ruby rt="かん">漢</ruby>')).toBe(true)
    expect(detectLiteXml('<p>前 <ruby rt="かん">漢</ruby> 後</p>')).toBe(true)
    expect(parseLiteXmlSerializedNodes('<p><ruby rt="かん">漢</ruby></p>')?.[0]).toMatchObject({
      type: 'paragraph',
      children: [
        { type: 'ruby', reading: 'かん' },
      ],
    })
    // Text that only mentions an rt somewhere isn't HTML ruby.
    expect(detectLiteXml('<codeblock lang="txt">art and rtl</codeblock>')).toBe(true)
  })
})
