import type { SerializedEditorState } from 'lexical'

import { describe, expect, it } from 'vitest'
import { createDefaultRegistry } from '../src/default-registry'
import { deserializeFromXml } from '../src/deserializer'
import { serializeToXml } from '../src/serializer'
import '../src/index-browser'

const registry = createDefaultRegistry()

function roundtrip(xml: string) {
  const state = deserializeFromXml(`<doc>${xml}</doc>`, registry)
  const output = serializeToXml(state, registry)
  // Strip <doc> wrapper for comparison
  return output
    .replace(/^<doc>\n/, '')
    .replace(/<\/doc>\n$/, '')
    .trim()
}

describe('roundtrip', () => {
  it('paragraph with plain text', () => {
    expect(roundtrip('<p id="p1">hello world</p>')).toBe('<p id="p1">hello world</p>')
  })

  it('paragraph with formatted text', () => {
    expect(roundtrip('<p id="p1">normal <b>bold</b> <i>italic</i></p>')).toBe(
      '<p id="p1">normal <b>bold</b> <i>italic</i></p>',
    )
  })

  it('heading', () => {
    expect(roundtrip('<h2 id="h1">Title</h2>')).toBe('<h2 id="h1">Title</h2>')
  })

  it('blockquote with attribution', () => {
    const input = '<blockquote id="q1" attribution="— Wang Xizhi">quoted</blockquote>'
    expect(roundtrip(input)).toBe(input)
  })

  it('blockquote without attribution stays as plain quote', () => {
    const input = '<blockquote id="q1">quoted</blockquote>'
    expect(roundtrip(input)).toBe(input)
  })

  it('unordered list', () => {
    const input = '<ul id="u1">\n  <li id="l1">A</li>\n  <li id="l2">B</li>\n</ul>'
    const result = roundtrip(input)
    expect(result).toContain('<ul id="u1">')
    expect(result).toContain('<li id="l1">A</li>')
    expect(result).toContain('<li id="l2">B</li>')
  })

  it('code-block', () => {
    expect(roundtrip('<codeblock id="c1" lang="ts">const x = 1</codeblock>')).toBe(
      '<codeblock id="c1" lang="ts">const x = 1</codeblock>',
    )
  })

  it('image', () => {
    expect(roundtrip('<img id="i1" src="/a.jpg" alt="Photo" />')).toContain('src="/a.jpg"')
  })

  it('image with display-width and layout', () => {
    const result = roundtrip(
      '<img id="i1" src="/a.jpg" alt="Photo" display-width="60" layout="float-right" />',
    )
    expect(result).toContain('display-width="60"')
    expect(result).toContain('layout="float-right"')
  })

  it('image with fixed-width', () => {
    const result = roundtrip('<img id="i1" src="/a.jpg" alt="Photo" fixed-width="360" />')
    expect(result).toContain('fixed-width="360"')
    expect(result).not.toContain('fixed-height')
  })

  it('image with fixed-height', () => {
    const result = roundtrip('<img id="i1" src="/a.jpg" alt="Photo" fixed-height="240" />')
    expect(result).toContain('fixed-height="240"')
    expect(result).not.toContain('fixed-width')
  })

  it('link inside paragraph', () => {
    const result = roundtrip('<p id="p1">See <a href="https://x.com">link</a></p>')
    expect(result).toContain('<a href="https://x.com">link</a>')
  })

  it('new XML without ids (AI-generated content)', () => {
    // AI-generated XML won't have ids — should still roundtrip structurally
    const state = deserializeFromXml('<doc><p>new para</p><h2>new heading</h2></doc>', registry)
    const children = (state.root as any).children
    expect(children).toHaveLength(2)
    expect(children[0].type).toBe('paragraph')
    expect(children[1].type).toBe('heading')
    expect(children[1].tag).toBe('h2')
  })

  it('excalidraw roundtrip', () => {
    const result = roundtrip('<excalidraw id="ex1"><![CDATA[{"elements":[]}]]></excalidraw>')
    expect(result).toContain('<excalidraw id="ex1">')
    expect(result).toContain('<![CDATA[{"elements":[]}]]>')
    expect(result).toContain('</excalidraw>')
  })

  it('excalidraw empty roundtrip (AI inserts empty block)', () => {
    const result = roundtrip('<excalidraw />')
    expect(result).toContain('<excalidraw')
  })

  it('chart roundtrip with a valid spec', () => {
    const input
      = '<chart><![CDATA[{"version":1,"type":"bar","x":"k","series":[{"key":"v","label":"Value"}],"data":[{"k":"a","v":1},{"k":"b","v":2}]}]]></chart>'
    expect(roundtrip(input)).toBe(input)
  })

  it('chart roundtrip keeps invalid JSON verbatim', () => {
    const input = '<chart><![CDATA[{"type": "bar", "data": [1, 2 <oops> & more]]></chart>'
    expect(roundtrip(input)).toBe(input)
  })

  it('chart roundtrip keeps a multi-line spec', () => {
    const input = '<chart id="c2"><![CDATA[{\n  "version": 1,\n  "type": "pie"\n}]]></chart>'
    expect(roundtrip(input)).toBe(input)
  })

  it('chart roundtrip with block id', () => {
    const input = '<chart id="c1"><![CDATA[{"version":1}]]></chart>'
    expect(roundtrip(input)).toBe(input)
  })

  it('empty chart roundtrip', () => {
    expect(roundtrip('<chart id="c3" />')).toBe('<chart id="c3" />')
    expect(roundtrip('<chart></chart>')).toBe('<chart />')
  })

  it('chart reads to a serialized node with the raw spec string', () => {
    const state = deserializeFromXml(
      '<doc><chart id="c1"><![CDATA[{"type":"bar"}]]></chart><chart /></doc>',
      registry,
    )
    expect(state.root.children).toEqual([
      {
        type: 'chart',
        $: { blockId: 'c1' },
        spec: '{"type":"bar"}',
        version: 1,
      },
      { type: 'chart', spec: '', version: 1 },
    ])
  })

  it('dynamic roundtrip', () => {
    const input
      = '<dynamic id="dyn1" url="https://cdn.example.com/widget.mjs" initial-height="480"><![CDATA[{"level":1}]]></dynamic>'
    expect(roundtrip(input)).toBe(input)
  })

  it('dynamic without props roundtrip', () => {
    const input
      = '<dynamic id="dyn2" url="https://cdn.example.com/widget.mjs" initial-height="320" />'
    expect(roundtrip(input)).toBe(input)
  })

  it('grid-container roundtrip', () => {
    const result = roundtrip(
      '<grid id="g1" cols="2" gap="16px"><cell><p>A</p></cell><cell><p>B</p></cell></grid>',
    )
    expect(result).toContain('<grid id="g1" cols="2" gap="16px">')
    expect(result).toContain('<cell>')
    expect(result).toContain('<p>A</p>')
    expect(result).toContain('<p>B</p>')
    expect(result).toContain('</grid>')
  })

  it('steps roundtrip keeps step ids, titles and content', () => {
    const input
      = '<steps id="st1"><step id="s_a" title="Install &quot;it&quot;"><p>A</p></step><step id="s_b" title="Configure"><p>B</p><ul><li>one</li></ul></step></steps>'
    const result = roundtrip(input)
    expect(result).toContain('<steps id="st1">')
    expect(result).toContain('<step id="s_a" title="Install &quot;it&quot;">')
    expect(result).toContain('<p>A</p>')
    expect(result).toContain('<step id="s_b" title="Configure">')
    expect(result).toContain('<p>B</p>')
    expect(result).toContain('<li>one</li>')
    expect(result).toContain('</steps>')
  })

  it('steps reader builds step objects with nested content', () => {
    const registry = createDefaultRegistry()
    const [node] = deserializeFromXml(
      '<steps id="st1"><step title="No id"><p>Body</p></step></steps>',
      registry,
    ).root.children as any[]
    expect(node.type).toBe('steps')
    expect(node.$).toEqual({ blockId: 'st1' })
    expect(node.steps).toHaveLength(1)
    expect(node.steps[0].title).toBe('No id')
    expect(node.steps[0].id).toMatch(/^s_[\da-z]+$/)
    expect(node.steps[0].content.root.children[0].type).toBe('paragraph')
  })

  it('gallery roundtrip with aspect, fit, and max-item-height', () => {
    const input
      = '<gallery id="g1" layout="masonry" aspect="16:9" fit="contain" max-item-height="480"><img src="/a.jpg" alt="A" /><img src="/b.jpg" alt="B" /></gallery>'
    const result = roundtrip(input)
    expect(result).toContain(
      '<gallery id="g1" layout="masonry" aspect="16:9" fit="contain" max-item-height="480">',
    )
    expect(result).toContain('<img src="/a.jpg" alt="A" />')
    expect(result).toContain('<img src="/b.jpg" alt="B" />')
  })

  it('legacy gallery with no new attributes survives unchanged', () => {
    const input = '<gallery layout="grid"><img src="/a.jpg" alt="A" /></gallery>'
    const result = roundtrip(input)
    expect(result).toContain('<gallery layout="grid">')
    expect(result).not.toContain('aspect')
    expect(result).not.toContain('fit')
    expect(result).not.toContain('max-item-height')
  })

  it('agent-diff roundtrip', () => {
    const result = roundtrip('<agent-diff id="ad1" op="insert" entry="d1" />')
    expect(result).toContain('<agent-diff')
    expect(result).toContain('op="insert"')
    expect(result).toContain('entry="d1"')
  })

  it('chat user-agent roundtrip', () => {
    const xml
      = '<chat variant="user-agent">'
        + '<participants>'
        + '<participant id="p_u" kind="user" name="Octocat"></participant>'
        + '<participant id="p_a" kind="agent" name="Claude"></participant>'
        + '</participants>'
        + '<messages>'
        + '<message id="m1" participant="p_u">How are you?</message>'
        + '<message id="m2" participant="p_a">I am fine.</message>'
        + '</messages>'
        + '</chat>'
    const result = roundtrip(xml)
    expect(result).toContain('<chat variant="user-agent">')
    expect(result).toContain('<participant id="p_u" kind="user" name="Octocat"')
    expect(result).toContain('<participant id="p_a" kind="agent" name="Claude"')
    expect(result).toContain('<message id="m1" participant="p_u">How are you?</message>')
    expect(result).toContain('<message id="m2" participant="p_a">I am fine.</message>')
  })

  it('chat user-user roundtrip preserves both bubbles', () => {
    const xml
      = '<chat variant="user-user">'
        + '<participants>'
        + '<participant id="p_a" kind="user" name="Alice"></participant>'
        + '<participant id="p_b" kind="user" name="Bob"></participant>'
        + '</participants>'
        + '<messages>'
        + '<message id="m1" participant="p_a">Hi</message>'
        + '<message id="m2" participant="p_b">Hello</message>'
        + '</messages>'
        + '</chat>'
    const result = roundtrip(xml)
    expect(result).toContain('<chat variant="user-user">')
    expect(result).toContain('<participant id="p_a" kind="user" name="Alice"')
    expect(result).toContain('<participant id="p_b" kind="user" name="Bob"')
  })
})

/**
 * A `<blockquote>` is shared by two node types, so the codec must preserve
 * which one it round-tripped through. These cases pin that contract: a rich
 * quote with no attribution is otherwise indistinguishable from a plain quote,
 * and the XML writer drops empty attribute values, so the type cannot ride on
 * `attribution` alone.
 */
describe('roundtrip node identity', () => {
  const roundtripState = (xml: string) =>
    serializeToXml(deserializeFromXml(`<doc>${xml}</doc>`, registry), registry)

  it('keeps a rich quote that has no attribution', () => {
    const state = deserializeFromXml(
      '<doc><blockquote id="q1" rich="true"><p>hi</p></blockquote></doc>',
      registry,
    )
    expect((state.root as any).children[0].type).toBe('rich-quote')
    expect((state.root as any).children[0].attribution).toBeNull()

    const xml = roundtripState('<blockquote id="q1" rich="true"><p>hi</p></blockquote>')
    const back = deserializeFromXml(xml, registry)
    expect((back.root as any).children[0].type).toBe('rich-quote')
  })

  it('keeps a rich quote that has an attribution, without needing the flag', () => {
    const xml = roundtripState(
      '<blockquote id="q1" rich="true" attribution="Ada"><p>hi</p></blockquote>',
    )
    const back = deserializeFromXml(xml, registry)
    expect((back.root as any).children[0].type).toBe('rich-quote')
    expect((back.root as any).children[0].attribution).toBe('Ada')
  })

  it('keeps a plain quote plain', () => {
    const xml = roundtripState('<blockquote id="q1"><p>hi</p></blockquote>')
    const back = deserializeFromXml(xml, registry)
    expect((back.root as any).children[0].type).toBe('quote')
  })

  it('treats a whitespace-only attribution as absent', () => {
    const state = deserializeFromXml(
      '<doc><blockquote id="q1" attribution="   "><p>hi</p></blockquote></doc>',
      registry,
    )
    expect((state.root as any).children[0].type).toBe('rich-quote')
    expect((state.root as any).children[0].attribution).toBeNull()
  })

  it('keeps a link rel attribute', () => {
    const xml = roundtripState('<a href="https://x.test" rel="noreferrer">link</a>')
    const back = deserializeFromXml(xml, registry)
    expect((back.root as any).children[0].rel).toBe('noreferrer')
  })

  it('leaves rel null when the element has none', () => {
    const state = deserializeFromXml('<doc><a href="https://x.test">link</a></doc>', registry)
    expect((state.root as any).children[0].rel).toBeNull()
  })
})

/*
 * One of every node hakulex has, in stored shapes, with the XML and what reads back from it.
 */
const EVERY_NODE = {
  root: {
    type: 'root',
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
    children: [
      {
        type: 'image',
        src: 'https://x.test/a.png',
        altText: '圖',
        width: 800,
        height: 600,
        caption: '說明',
        thumbhash: 'abc',
        accent: '#112233',
        displayWidth: 60,
        layout: 'float-left',
        version: 1,
      },
      {
        type: 'video',
        src: 'https://x.test/v.mp4',
        poster: 'https://x.test/p.jpg',
        version: 1,
      },
      {
        type: 'file',
        src: 'https://x.test/f.pdf',
        name: '報告.pdf',
        size: 2048,
        mimeType: 'application/pdf',
        ext: 'pdf',
        display: 'inline',
        version: 1,
      },
      {
        type: 'link-card',
        url: 'https://github.com/a/b',
        source: 'github',
        title: 'a/b',
        description: 'desc',
        favicon: 'https://x.test/f.ico',
        image: 'https://x.test/i.png',
        version: 1,
      },
      {
        type: 'embed',
        url: 'https://www.youtube.com/watch?v=x',
        source: 'youtube',
        version: 1,
      },
      {
        type: 'code-block',
        code: 'const a = 1 < 2 && b\n# not md',
        language: 'ts',
        version: 1,
      },
      {
        type: 'mermaid',
        diagram: 'graph TD\n  A-->B',
        version: 1,
      },
      {
        type: 'katex-block',
        equation: '\\int_0^1 x\\,dx',
        version: 1,
      },
      {
        type: 'paragraph',
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
        textFormat: 0,
        textStyle: '',
        children: [
          {
            type: 'text',
            text: 'x ',
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
          {
            type: 'katex-inline',
            equation: 'a^2',
            color: '#ff0000',
            version: 1,
          },
          {
            type: 'text',
            text: ' ',
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
          {
            type: 'mention',
            platform: 'GH',
            handle: 'octocat',
            displayName: 'Octocat',
            version: 1,
          },
          {
            type: 'text',
            text: ' ',
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
          {
            type: 'tag',
            text: '標籤',
            version: 1,
          },
          {
            type: 'comment',
            text: '註解',
            version: 1,
          },
          {
            type: 'spoiler',
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            textFormat: 0,
            textStyle: '',
            children: [
              {
                type: 'text',
                text: '雷',
                format: 0,
                detail: 0,
                mode: 'normal',
                style: '',
                version: 1,
              },
            ],
          },
          {
            type: 'ruby',
            reading: 'かん',
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            textFormat: 0,
            textStyle: '',
            children: [
              {
                type: 'text',
                text: '漢',
                format: 0,
                detail: 0,
                mode: 'normal',
                style: '',
                version: 1,
              },
            ],
          },
          {
            type: 'footnote',
            identifier: '1',
            version: 1,
          },
        ],
      },
      {
        type: 'alert-quote',
        alertType: 'warning',
        content: {
          root: {
            type: 'root',
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            children: [
              {
                type: 'paragraph',
                direction: 'ltr',
                format: '',
                indent: 0,
                version: 1,
                textFormat: 0,
                textStyle: '',
                children: [
                  {
                    type: 'text',
                    text: '小心',
                    format: 0,
                    detail: 0,
                    mode: 'normal',
                    style: '',
                    version: 1,
                  },
                ],
              },
            ],
          },
        },
        version: 1,
      },
      {
        type: 'banner',
        bannerType: 'tip',
        content: {
          root: {
            type: 'root',
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            children: [
              {
                type: 'paragraph',
                direction: 'ltr',
                format: '',
                indent: 0,
                version: 1,
                textFormat: 0,
                textStyle: '',
                children: [
                  {
                    type: 'text',
                    text: '提示',
                    format: 0,
                    detail: 0,
                    mode: 'normal',
                    style: '',
                    version: 1,
                  },
                ],
              },
            ],
          },
        },
        version: 1,
      },
      {
        type: 'details',
        summary: '更多',
        open: true,
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
        children: [
          {
            type: 'paragraph',
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            textFormat: 0,
            textStyle: '',
            children: [
              {
                type: 'text',
                text: '內容',
                format: 0,
                detail: 0,
                mode: 'normal',
                style: '',
                version: 1,
              },
            ],
          },
        ],
      },
      {
        type: 'nested-doc',
        content: {
          root: {
            type: 'root',
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            children: [
              {
                type: 'paragraph',
                direction: 'ltr',
                format: '',
                indent: 0,
                version: 1,
                textFormat: 0,
                textStyle: '',
                children: [
                  {
                    type: 'text',
                    text: '巢狀',
                    format: 0,
                    detail: 0,
                    mode: 'normal',
                    style: '',
                    version: 1,
                  },
                ],
              },
            ],
          },
        },
        version: 1,
      },
      {
        type: 'grid-container',
        cols: 2,
        gap: '16px',
        cells: [
          {
            root: {
              type: 'root',
              direction: 'ltr',
              format: '',
              indent: 0,
              version: 1,
              children: [
                {
                  type: 'paragraph',
                  direction: 'ltr',
                  format: '',
                  indent: 0,
                  version: 1,
                  textFormat: 0,
                  textStyle: '',
                  children: [
                    {
                      type: 'text',
                      text: '左',
                      format: 0,
                      detail: 0,
                      mode: 'normal',
                      style: '',
                      version: 1,
                    },
                  ],
                },
              ],
            },
          },
          {
            root: {
              type: 'root',
              direction: 'ltr',
              format: '',
              indent: 0,
              version: 1,
              children: [
                {
                  type: 'paragraph',
                  direction: 'ltr',
                  format: '',
                  indent: 0,
                  version: 1,
                  textFormat: 0,
                  textStyle: '',
                  children: [
                    {
                      type: 'text',
                      text: '右',
                      format: 0,
                      detail: 0,
                      mode: 'normal',
                      style: '',
                      version: 1,
                    },
                  ],
                },
              ],
            },
          },
        ],
        version: 1,
      },
      {
        type: 'steps',
        steps: [
          {
            id: 's_one',
            title: '第一步',
            content: {
              root: {
                type: 'root',
                direction: 'ltr',
                format: '',
                indent: 0,
                version: 1,
                children: [
                  {
                    type: 'paragraph',
                    direction: 'ltr',
                    format: '',
                    indent: 0,
                    version: 1,
                    textFormat: 0,
                    textStyle: '',
                    children: [
                      {
                        type: 'text',
                        text: '做這個',
                        format: 0,
                        detail: 0,
                        mode: 'normal',
                        style: '',
                        version: 1,
                      },
                    ],
                  },
                ],
              },
            },
          },
          {
            id: 's_two',
            title: '第二步',
            content: {
              root: {
                type: 'root',
                direction: 'ltr',
                format: '',
                indent: 0,
                version: 1,
                children: [
                  {
                    type: 'paragraph',
                    direction: 'ltr',
                    format: '',
                    indent: 0,
                    version: 1,
                    textFormat: 0,
                    textStyle: '',
                    children: [
                      {
                        type: 'text',
                        text: '再做那個',
                        format: 0,
                        detail: 0,
                        mode: 'normal',
                        style: '',
                        version: 1,
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
        version: 1,
      },
      {
        type: 'gallery',
        images: [
          {
            src: 'https://x.test/1.png',
            alt: '一',
            width: 100,
            height: 80,
          },
          {
            src: 'https://x.test/2.png',
            alt: '二',
          },
        ],
        layout: 'grid',
        aspect: '4:3',
        fit: 'contain',
        maxItemHeight: 320,
        version: 1,
      },
      {
        type: 'code-snippet',
        files: [
          {
            filename: 'a.ts',
            language: 'ts',
            code: 'export const a = 1',
          },
          {
            filename: 'b.css',
            language: 'css',
            code: 'a { color: red }',
          },
        ],
        version: 1,
      },
      {
        type: 'chart',
        spec: '{"type":"bar","data":[1,2]}\n<&>',
        version: 1,
      },
      {
        type: 'chat',
        variant: 'user-agent',
        participants: [
          {
            id: 'p_u',
            kind: 'user',
            name: '我',
            avatar: 'https://x.test/u.png',
          },
          {
            id: 'p_a',
            kind: 'agent',
            name: '助理',
          },
        ],
        messages: [
          {
            id: 'm_1',
            participantId: 'p_u',
            content: '你好',
          },
          {
            id: 'm_2',
            participantId: 'p_a',
            content: '**哈囉**',
          },
        ],
        version: 1,
      },
      {
        type: 'poll',
        pollId: 'p_poll1',
        question: '哪個？',
        options: [
          {
            id: 'o_a',
            label: 'A',
          },
          {
            id: 'o_b',
            label: 'B',
          },
        ],
        mode: 'multiple',
        closeAt: '2026-12-01',
        showResults: 'after-vote',
        version: 1,
      },
      {
        type: 'dynamic',
        url: 'https://x.test/widget.js',
        initialHeight: 240,
        props: {
          a: 1,
          b: '<x>',
        },
        version: 1,
      },
      {
        type: 'footnote-section',
        definitions: {
          1: '註腳內容',
        },
        version: 1,
      },
      {
        type: 'excalidraw',
        snapshot: '{"elements":[]}',
        version: 1,
      },
      {
        type: 'rich-quote',
        attribution: null,
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
        children: [
          {
            type: 'paragraph',
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            textFormat: 0,
            textStyle: '',
            children: [
              {
                type: 'text',
                text: '無出處',
                format: 0,
                detail: 0,
                mode: 'normal',
                style: '',
                version: 1,
              },
            ],
          },
        ],
      },
    ],
  },
} as unknown as SerializedEditorState

const EVERY_NODE_XML = '<doc>\n  <img src="https://x.test/a.png" alt="圖" width="800" height="600" caption="說明" thumbhash="abc" accent="#112233" display-width="60" layout="float-left" />\n  <video src="https://x.test/v.mp4" poster="https://x.test/p.jpg" />\n  <attachment src="https://x.test/f.pdf" name="報告.pdf" size="2048" mime-type="application/pdf" ext="pdf" display="inline" />\n  <link-card url="https://github.com/a/b" source="github" title="a/b" description="desc" favicon="https://x.test/f.ico" image="https://x.test/i.png" />\n  <embed url="https://www.youtube.com/watch?v=x" source="youtube" />\n  <codeblock lang="ts">const a = 1 &lt; 2 &amp;&amp; b\n# not md</codeblock>\n  <mermaid>graph TD\n  A--&gt;B</mermaid>\n  <math display="block">\\int_0^1 x\\,dx</math>\n  <p>x <math color="#ff0000">a^2</math> <mention platform="GH" handle="octocat">Octocat</mention> <tag>標籤</tag><comment>註解</comment><spoiler>雷</spoiler><ruby rt="かん">漢</ruby><footnote ref="1" /></p>\n  <alert type="warning">\n    <p>小心</p>\n  </alert>\n  <banner type="tip">\n    <p>提示</p>\n  </banner>\n  <details summary="更多" open="true">\n    <p>內容</p>\n  </details>\n  <nested-doc>\n    <p>巢狀</p>\n  </nested-doc>\n  <grid cols="2" gap="16px">\n    <cell>\n      <p>左</p>\n    </cell>\n    <cell>\n      <p>右</p>\n    </cell>\n  </grid>\n  <steps>\n    <step id="s_one" title="第一步">\n      <p>做這個</p>\n    </step>\n    <step id="s_two" title="第二步">\n      <p>再做那個</p>\n    </step>\n  </steps>\n  <gallery layout="grid" aspect="4:3" fit="contain" max-item-height="320"><img src="https://x.test/1.png" alt="一" width="100" height="80" /><img src="https://x.test/2.png" alt="二" /></gallery>\n  <code-snippet>\n    <file name="a.ts" lang="ts">export const a = 1</file>\n    <file name="b.css" lang="css">a { color: red }</file>\n  </code-snippet>\n  <chart><![CDATA[{"type":"bar","data":[1,2]}\n<&>]]></chart>\n  <chat variant="user-agent">\n    <participants>\n      <participant id="p_u" kind="user" name="我" avatar="https://x.test/u.png" />\n      <participant id="p_a" kind="agent" name="助理" />\n    </participants>\n    <messages>\n      <message id="m_1" participant="p_u">你好</message>\n      <message id="m_2" participant="p_a">**哈囉**</message>\n    </messages>\n  </chat>\n  <poll poll-id="p_poll1" mode="multiple" close-at="2026-12-01" show-results="after-vote">\n    <question>哪個？</question>\n    <option id="o_a">A</option>\n    <option id="o_b">B</option>\n  </poll>\n  <dynamic url="https://x.test/widget.js" initial-height="240"><![CDATA[{"a":1,"b":"<x>"}]]></dynamic>\n  <footnote-section>\n    <def ref="1">註腳內容</def>\n  </footnote-section>\n  <excalidraw><![CDATA[{"elements":[]}]]></excalidraw>\n  <blockquote rich="true">\n    <p>無出處</p>\n  </blockquote>\n</doc>\n'

const EVERY_NODE_BACK = {
  root: {
    type: 'root',
    children: [
      {
        type: 'image',
        src: 'https://x.test/a.png',
        altText: '圖',
        width: 800,
        height: 600,
        caption: '說明',
        thumbhash: 'abc',
        accent: '#112233',
        displayWidth: 60,
        layout: 'float-left',
        version: 1,
      },
      {
        type: 'video',
        src: 'https://x.test/v.mp4',
        poster: 'https://x.test/p.jpg',
        version: 1,
      },
      {
        type: 'file',
        src: 'https://x.test/f.pdf',
        name: '報告.pdf',
        size: 2048,
        mimeType: 'application/pdf',
        ext: 'pdf',
        display: 'inline',
        version: 1,
      },
      {
        type: 'link-card',
        url: 'https://github.com/a/b',
        source: 'github',
        title: 'a/b',
        description: 'desc',
        favicon: 'https://x.test/f.ico',
        image: 'https://x.test/i.png',
        version: 1,
      },
      {
        type: 'embed',
        url: 'https://www.youtube.com/watch?v=x',
        source: 'youtube',
        version: 1,
      },
      {
        type: 'code-block',
        code: 'const a = 1 < 2 && b\n# not md',
        language: 'ts',
        version: 1,
      },
      {
        type: 'mermaid',
        diagram: 'graph TD\n  A-->B',
        version: 1,
      },
      {
        type: 'katex-block',
        equation: '\\int_0^1 x\\,dx',
        version: 1,
      },
      {
        type: 'paragraph',
        children: [
          {
            type: 'text',
            text: 'x ',
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
          {
            type: 'katex-inline',
            equation: 'a^2',
            color: '#ff0000',
            version: 1,
          },
          {
            type: 'text',
            text: ' ',
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
          {
            type: 'mention',
            platform: 'GH',
            handle: 'octocat',
            displayName: 'Octocat',
            version: 1,
          },
          {
            type: 'text',
            text: ' ',
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
          {
            type: 'tag',
            text: '標籤',
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
          {
            type: 'comment',
            text: '註解',
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
          {
            type: 'spoiler',
            children: [
              {
                type: 'text',
                text: '雷',
                format: 0,
                detail: 0,
                mode: 'normal',
                style: '',
                version: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
            version: 1,
          },
          {
            type: 'ruby',
            reading: 'かん',
            children: [
              {
                type: 'text',
                text: '漢',
                format: 0,
                detail: 0,
                mode: 'normal',
                style: '',
                version: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
            version: 1,
          },
          {
            type: 'footnote',
            identifier: '1',
            version: 1,
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
        version: 1,
      },
      {
        type: 'alert-quote',
        alertType: 'warning',
        content: {
          root: {
            type: 'root',
            children: [
              {
                type: 'paragraph',
                children: [
                  {
                    type: 'text',
                    text: '小心',
                    format: 0,
                    detail: 0,
                    mode: 'normal',
                    style: '',
                    version: 1,
                  },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                textFormat: 0,
                textStyle: '',
                version: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
          },
        },
        version: 1,
      },
      {
        type: 'banner',
        bannerType: 'tip',
        content: {
          root: {
            type: 'root',
            children: [
              {
                type: 'paragraph',
                children: [
                  {
                    type: 'text',
                    text: '提示',
                    format: 0,
                    detail: 0,
                    mode: 'normal',
                    style: '',
                    version: 1,
                  },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                textFormat: 0,
                textStyle: '',
                version: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
          },
        },
        version: 1,
      },
      {
        type: 'details',
        summary: '更多',
        open: true,
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: '內容',
                format: 0,
                detail: 0,
                mode: 'normal',
                style: '',
                version: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
            version: 1,
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
      },
      {
        type: 'nested-doc',
        content: {
          root: {
            type: 'root',
            children: [
              {
                type: 'paragraph',
                children: [
                  {
                    type: 'text',
                    text: '巢狀',
                    format: 0,
                    detail: 0,
                    mode: 'normal',
                    style: '',
                    version: 1,
                  },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                textFormat: 0,
                textStyle: '',
                version: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
          },
        },
        version: 1,
      },
      {
        type: 'grid-container',
        cols: 2,
        gap: '16px',
        cells: [
          {
            root: {
              type: 'root',
              children: [
                {
                  type: 'paragraph',
                  children: [
                    {
                      type: 'text',
                      text: '左',
                      format: 0,
                      detail: 0,
                      mode: 'normal',
                      style: '',
                      version: 1,
                    },
                  ],
                  direction: 'ltr',
                  format: '',
                  indent: 0,
                  textFormat: 0,
                  textStyle: '',
                  version: 1,
                },
              ],
              direction: 'ltr',
              format: '',
              indent: 0,
              version: 1,
            },
          },
          {
            root: {
              type: 'root',
              children: [
                {
                  type: 'paragraph',
                  children: [
                    {
                      type: 'text',
                      text: '右',
                      format: 0,
                      detail: 0,
                      mode: 'normal',
                      style: '',
                      version: 1,
                    },
                  ],
                  direction: 'ltr',
                  format: '',
                  indent: 0,
                  textFormat: 0,
                  textStyle: '',
                  version: 1,
                },
              ],
              direction: 'ltr',
              format: '',
              indent: 0,
              version: 1,
            },
          },
        ],
        version: 1,
      },
      {
        type: 'steps',
        steps: [
          {
            id: 's_one',
            title: '第一步',
            content: {
              root: {
                type: 'root',
                children: [
                  {
                    type: 'paragraph',
                    children: [
                      {
                        type: 'text',
                        text: '做這個',
                        format: 0,
                        detail: 0,
                        mode: 'normal',
                        style: '',
                        version: 1,
                      },
                    ],
                    direction: 'ltr',
                    format: '',
                    indent: 0,
                    textFormat: 0,
                    textStyle: '',
                    version: 1,
                  },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                version: 1,
              },
            },
          },
          {
            id: 's_two',
            title: '第二步',
            content: {
              root: {
                type: 'root',
                children: [
                  {
                    type: 'paragraph',
                    children: [
                      {
                        type: 'text',
                        text: '再做那個',
                        format: 0,
                        detail: 0,
                        mode: 'normal',
                        style: '',
                        version: 1,
                      },
                    ],
                    direction: 'ltr',
                    format: '',
                    indent: 0,
                    textFormat: 0,
                    textStyle: '',
                    version: 1,
                  },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                version: 1,
              },
            },
          },
        ],
        version: 1,
      },
      {
        type: 'gallery',
        images: [
          {
            src: 'https://x.test/1.png',
            alt: '一',
            width: 100,
            height: 80,
          },
          {
            src: 'https://x.test/2.png',
            alt: '二',
          },
        ],
        layout: 'grid',
        aspect: '4:3',
        fit: 'contain',
        maxItemHeight: 320,
        version: 1,
      },
      {
        type: 'code-snippet',
        files: [
          {
            filename: 'a.ts',
            code: 'export const a = 1',
            language: 'ts',
          },
          {
            filename: 'b.css',
            code: 'a { color: red }',
            language: 'css',
          },
        ],
        version: 1,
      },
      {
        type: 'chart',
        spec: '{"type":"bar","data":[1,2]}\n<&>',
        version: 1,
      },
      {
        type: 'chat',
        variant: 'user-agent',
        participants: [
          {
            id: 'p_u',
            kind: 'user',
            name: '我',
            avatar: 'https://x.test/u.png',
          },
          {
            id: 'p_a',
            kind: 'agent',
            name: '助理',
          },
        ],
        messages: [
          {
            id: 'm_1',
            participantId: 'p_u',
            content: '你好',
          },
          {
            id: 'm_2',
            participantId: 'p_a',
            content: '**哈囉**',
          },
        ],
        version: 1,
      },
      {
        type: 'poll',
        pollId: 'p_poll1',
        question: '哪個？',
        options: [
          {
            id: 'o_a',
            label: 'A',
          },
          {
            id: 'o_b',
            label: 'B',
          },
        ],
        mode: 'multiple',
        closeAt: '2026-12-01',
        showResults: 'after-vote',
        version: 1,
      },
      {
        type: 'dynamic',
        url: 'https://x.test/widget.js',
        props: {
          a: 1,
          b: '<x>',
        },
        initialHeight: 240,
        version: 1,
      },
      {
        type: 'footnote-section',
        definitions: {
          1: '註腳內容',
        },
        version: 1,
      },
      {
        type: 'excalidraw',
        snapshot: '{"elements":[]}',
        version: 1,
      },
      {
        type: 'rich-quote',
        attribution: null,
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: '無出處',
                format: 0,
                detail: 0,
                mode: 'normal',
                style: '',
                version: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
            version: 1,
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
        version: 1,
      },
    ],
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  },
}

/** What the format leaves out of a node, by type. Nothing now: a gallery's image sizes used to be. */
const NOT_CARRIED: Record<string, (node: any) => any> = {}

/** Defaults the readers fill in that the original left out. */
function withDefaults(node: any): any {
  if (Array.isArray(node))
    return node.map(withDefaults)
  if (typeof node !== 'object' || node === null)
    return node
  const out: any = Object.fromEntries(Object.entries(node).map(([key, value]) => [
    key,
    withDefaults(value),
  ]))
  if (out.type === 'tag' || out.type === 'comment') {
    Object.assign(out, {
      detail: 0,
      format: 0,
      mode: 'normal',
      style: '',
    })
  }
  if (out.type === 'rich-quote')
    Object.assign(out, { textFormat: 0, textStyle: '' })
  return out
}

describe('every hakulex node', () => {
  const registry = createDefaultRegistry()

  it('writes the same XML', () => {
    expect(serializeToXml(EVERY_NODE, registry)).toBe(EVERY_NODE_XML)
  })

  it('reads it back to the expected document', () => {
    expect(deserializeFromXml(EVERY_NODE_XML, registry)).toEqual(EVERY_NODE_BACK)
  })

  it('comes back unchanged, but for what the format does not carry', () => {
    const back = (deserializeFromXml(serializeToXml(EVERY_NODE, registry), registry).root as any).children
    const original = (EVERY_NODE.root as any).children
    expect(back).toHaveLength(original.length)
    original.forEach((node: any, index: number) => {
      const expected = withDefaults((NOT_CARRIED[node.type] ?? ((same: any) => same))(node))
      expect(back[index], node.type).toEqual(expected)
    })
  })
})
