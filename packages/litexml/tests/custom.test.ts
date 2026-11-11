import type { SerializedEditorState } from 'lexical'
import { describe, expect, it } from 'vitest'

import { createDefaultRegistry } from '../src/default-registry'
import { deserializeFromXml } from '../src/deserializer'
import { registerBuiltinReaders } from '../src/readers/builtin'
import { registerCustomReaders } from '../src/readers/custom'
import { LitexmlRegistry } from '../src/registry'
import { serializeToXml } from '../src/serializer'
import { registerBuiltinWriters } from '../src/writers/builtin'

import { registerCustomWriters } from '../src/writers/custom'
import '../src/index-browser'

function makeState(children: any[]): SerializedEditorState {
  return {
    root: {
      type: 'root',
      children,
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  } as SerializedEditorState
}

function serialize(children: any[]): string {
  const registry = new LitexmlRegistry()
  registerBuiltinWriters(registry)
  registerCustomWriters(registry)
  return serializeToXml(makeState(children), registry)
}

describe('custom writers', () => {
  // Pattern A: simple attributes
  it('image', () => {
    const xml = serialize([
      {
        type: 'image',
        $: { blockId: 'img1' },
        src: '/photo.jpg',
        altText: 'A photo',
        width: 800,
        height: 600,
        version: 1,
      },
    ])
    expect(xml).toContain(
      '<img id="img1" src="/photo.jpg" alt="A photo" width="800" height="600" />',
    )
  })

  it('image with displayWidth and layout', () => {
    const xml = serialize([
      {
        type: 'image',
        $: { blockId: 'img2' },
        src: '/photo.jpg',
        altText: 'A photo',
        displayWidth: 60,
        layout: 'float-right',
        version: 1,
      },
    ])
    expect(xml).toContain('display-width="60"')
    expect(xml).toContain('layout="float-right"')
  })

  it('image without displayWidth and layout omits the attributes', () => {
    const xml = serialize([
      {
        type: 'image',
        src: '/photo.jpg',
        altText: 'A photo',
        version: 1,
      },
    ])
    expect(xml).not.toContain('display-width')
    expect(xml).not.toContain('layout')
    expect(xml).not.toContain('fixed-width')
    expect(xml).not.toContain('fixed-height')
  })

  it('image with fixedWidth', () => {
    const xml = serialize([
      {
        type: 'image',
        src: '/photo.jpg',
        altText: 'A photo',
        fixedWidth: 360,
        version: 1,
      },
    ])
    expect(xml).toContain('fixed-width="360"')
    expect(xml).not.toContain('display-width')
    expect(xml).not.toContain('fixed-height')
  })

  it('image with fixedHeight', () => {
    const xml = serialize([
      {
        type: 'image',
        src: '/photo.jpg',
        altText: 'A photo',
        fixedHeight: 240,
        version: 1,
      },
    ])
    expect(xml).toContain('fixed-height="240"')
    expect(xml).not.toContain('fixed-width')
  })

  it('video', () => {
    const xml = serialize([
      {
        type: 'video',
        $: { blockId: 'v1' },
        src: '/clip.mp4',
        poster: '/thumb.jpg',
        version: 1,
      },
    ])
    expect(xml).toContain('<video id="v1" src="/clip.mp4" poster="/thumb.jpg" />')
  })

  it('file', () => {
    const xml = serialize([
      {
        type: 'file',
        $: { blockId: 'f1' },
        src: '/spec.pdf',
        name: 'design-spec.pdf',
        size: 2_457_600,
        mimeType: 'application/pdf',
        ext: 'pdf',
        display: 'block',
        version: 1,
      },
    ])
    expect(xml).toContain(
      '<attachment id="f1" src="/spec.pdf" name="design-spec.pdf" size="2457600" mime-type="application/pdf" ext="pdf" />',
    )
    expect(xml).not.toContain('display=')
    const inlineXml = serialize([
      {
        type: 'file',
        src: '/a.md',
        name: 'a.md',
        display: 'inline',
        version: 1,
      },
    ])
    expect(inlineXml).toContain('display="inline"')
  })

  it('link-card', () => {
    const xml = serialize([
      {
        type: 'link-card',
        $: { blockId: 'lc1' },
        url: 'https://example.com',
        title: 'Example',
        version: 1,
      },
    ])
    expect(xml).toContain('<link-card id="lc1" url="https://example.com" title="Example" />')
  })

  it('embed', () => {
    const xml = serialize([
      {
        type: 'embed',
        $: { blockId: 'e1' },
        url: 'https://youtube.com/watch?v=123',
        source: 'youtube',
        version: 1,
      },
    ])
    expect(xml).toContain(
      '<embed id="e1" url="https://youtube.com/watch?v=123" source="youtube" />',
    )
  })

  // Pattern B: text content
  it('code-block', () => {
    const xml = serialize([
      {
        type: 'code-block',
        $: { blockId: 'cb1' },
        code: 'const x = 1',
        language: 'ts',
        version: 1,
      },
    ])
    expect(xml).toContain('<codeblock id="cb1" lang="ts">const x = 1</codeblock>')
  })

  it('mermaid', () => {
    const xml = serialize([
      {
        type: 'mermaid',
        $: { blockId: 'm1' },
        diagram: 'graph LR\n  A-->B',
        version: 1,
      },
    ])
    expect(xml).toContain('<mermaid id="m1">graph LR\n  A--&gt;B</mermaid>')
  })

  it('katex-block', () => {
    const xml = serialize([
      {
        type: 'katex-block',
        $: { blockId: 'kb1' },
        equation: 'E=mc^2',
        version: 1,
      },
    ])
    expect(xml).toContain('<math id="kb1" display="block">E=mc^2</math>')
  })

  it('katex-inline within paragraph', () => {
    const xml = serialize([
      {
        type: 'paragraph',
        $: { blockId: 'p1' },
        children: [
          {
            type: 'text',
            text: 'Energy is ',
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
          { type: 'katex-inline', equation: 'E=mc^2', version: 1 },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
        version: 1,
      },
    ])
    expect(xml).toContain('Energy is <math>E=mc^2</math>')
  })

  it('katex-inline with color attribute', () => {
    const xml = serialize([
      {
        type: 'paragraph',
        $: { blockId: 'p1' },
        children: [
          {
            type: 'katex-inline',
            equation: 'E=mc^2',
            color: '#ef4444',
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
    ])
    expect(xml).toContain('<math color="#ef4444">E=mc^2</math>')
  })

  // Pattern C: nested EditorState
  it('alert-quote', () => {
    const xml = serialize([
      {
        type: 'alert-quote',
        $: { blockId: 'aq1' },
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
                    text: 'Be careful',
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
    ])
    expect(xml).toContain('<alert id="aq1" type="warning">')
    expect(xml).toContain('<p>Be careful</p>')
    expect(xml).toContain('</alert>')
  })

  // Pattern D: element with children
  it('details', () => {
    const xml = serialize([
      {
        type: 'details',
        $: { blockId: 'd1' },
        summary: 'Click me',
        open: true,
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: 'hidden content',
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
    ])
    expect(xml).toContain('<details id="d1" summary="Click me" open="true">')
    expect(xml).toContain('<p>hidden content</p>')
    expect(xml).toContain('</details>')
  })

  // Pattern E: inline
  it('mention', () => {
    const xml = serialize([
      {
        type: 'paragraph',
        $: { blockId: 'p1' },
        children: [
          {
            type: 'text',
            text: 'Hi ',
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
          {
            type: 'mention',
            platform: 'github',
            handle: 'octocat',
            displayName: 'Octocat',
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
    ])
    expect(xml).toContain('Hi <mention platform="github" handle="octocat">Octocat</mention>')
  })

  it('tag', () => {
    const xml = serialize([
      {
        type: 'paragraph',
        $: { blockId: 'p1' },
        children: [
          {
            type: 'tag',
            text: 'AI',
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
    ])
    expect(xml).toContain('<tag>AI</tag>')
  })

  it('spoiler', () => {
    const xml = serialize([
      {
        type: 'paragraph',
        $: { blockId: 'p1' },
        children: [
          {
            type: 'spoiler',
            children: [
              {
                type: 'text',
                text: 'secret',
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
    ])
    expect(xml).toContain('<spoiler>secret</spoiler>')
  })

  it('ruby', () => {
    const xml = serialize([
      {
        type: 'paragraph',
        $: { blockId: 'p1' },
        children: [
          {
            type: 'ruby',
            reading: 'きょう',
            children: [
              {
                type: 'text',
                text: '今日',
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
    ])
    expect(xml).toContain('<ruby rt="きょう">今日</ruby>')
  })

  it('footnote', () => {
    const xml = serialize([
      {
        type: 'paragraph',
        $: { blockId: 'p1' },
        children: [
          {
            type: 'text',
            text: 'text',
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
          { type: 'footnote', identifier: '1', version: 1 },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
        version: 1,
      },
    ])
    expect(xml).toContain('text<footnote ref="1" />')
  })

  it('footnote-section', () => {
    const xml = serialize([
      {
        type: 'footnote-section',
        $: { blockId: 'fs1' },
        definitions: { 1: 'First note', 2: 'Second note' },
        version: 1,
      },
    ])
    expect(xml).toContain('<footnote-section id="fs1">')
    expect(xml).toContain('<def ref="1">First note</def>')
    expect(xml).toContain('<def ref="2">Second note</def>')
  })

  it('gallery', () => {
    const xml = serialize([
      {
        type: 'gallery',
        $: { blockId: 'g1' },
        images: [
          { src: '/a.jpg', alt: 'A' },
          { src: '/b.jpg', alt: 'B' },
        ],
        layout: 'grid',
        version: 1,
      },
    ])
    expect(xml).toContain('<gallery id="g1" layout="grid">')
    expect(xml).toContain('<img src="/a.jpg" alt="A" />')
    expect(xml).toContain('<img src="/b.jpg" alt="B" />')
  })

  it('gallery with non-default aspect, fit, and maxItemHeight', () => {
    const xml = serialize([
      {
        type: 'gallery',
        $: { blockId: 'g1' },
        images: [
          { src: '/a.jpg', alt: 'A' },
        ],
        layout: 'masonry',
        aspect: '16:9',
        fit: 'contain',
        maxItemHeight: 480,
        version: 1,
      },
    ])
    expect(xml).toContain(
      '<gallery id="g1" layout="masonry" aspect="16:9" fit="contain" max-item-height="480">',
    )
  })

  it('gallery omits aspect and fit at their defaults, and unset maxItemHeight', () => {
    const xml = serialize([
      {
        type: 'gallery',
        images: [
          { src: '/a.jpg', alt: 'A' },
        ],
        layout: 'grid',
        aspect: 'auto',
        fit: 'cover',
        version: 1,
      },
    ])
    expect(xml).toContain('<gallery layout="grid">')
    expect(xml).not.toContain('aspect')
    expect(xml).not.toContain('fit')
    expect(xml).not.toContain('max-item-height')
  })

  it('excalidraw', () => {
    const xml = serialize([
      {
        type: 'excalidraw',
        $: { blockId: 'ex1' },
        snapshot: '{"elements":[]}',
        version: 1,
      },
    ])
    expect(xml).toContain('<excalidraw id="ex1"><![CDATA[{"elements":[]}]]></excalidraw>')
  })

  it('excalidraw remote URL snapshot writes as plain text', () => {
    const xml = serialize([
      {
        type: 'excalidraw',
        $: { blockId: 'ex1' },
        snapshot: 'https://cdn.example.com/diagram.excalidraw',
        version: 1,
      },
    ])
    expect(xml).toContain(
      '<excalidraw id="ex1">https://cdn.example.com/diagram.excalidraw</excalidraw>',
    )
    expect(xml).not.toContain('CDATA')
  })

  it('excalidraw empty snapshot', () => {
    const xml = serialize([
      {
        type: 'excalidraw',
        $: { blockId: 'ex2' },
        snapshot: '',
        version: 1,
      },
    ])
    expect(xml).toContain('<excalidraw id="ex2" />')
  })

  it('chart writes the raw spec as CDATA', () => {
    const xml = serialize([
      {
        type: 'chart',
        $: { blockId: 'c1' },
        spec: '{"type":"bar"}',
        version: 1,
      },
    ])
    expect(xml).toContain('<chart id="c1"><![CDATA[{"type":"bar"}]]></chart>')
  })

  it('chart with empty spec is self-closing', () => {
    const xml = serialize([
      { type: 'chart', spec: '', version: 1 },
    ])
    expect(xml).toContain('<chart />')
  })

  it('dynamic with props', () => {
    const xml = serialize([
      {
        type: 'dynamic',
        $: { blockId: 'dyn1' },
        url: 'https://cdn.example.com/widget.mjs',
        props: { level: 1 },
        initialHeight: 480,
        version: 1,
      },
    ])
    expect(xml).toContain(
      '<dynamic id="dyn1" url="https://cdn.example.com/widget.mjs" initial-height="480"><![CDATA[{"level":1}]]></dynamic>',
    )
  })

  it('dynamic without props is self-closing', () => {
    const xml = serialize([
      {
        type: 'dynamic',
        $: { blockId: 'dyn2' },
        url: 'https://cdn.example.com/widget.mjs',
        props: {},
        initialHeight: 320,
        version: 1,
      },
    ])
    expect(xml).toContain(
      '<dynamic id="dyn2" url="https://cdn.example.com/widget.mjs" initial-height="320" />',
    )
  })

  it('grid-container', () => {
    const xml = serialize([
      {
        type: 'grid-container',
        $: { blockId: 'g1' },
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
                      text: 'Cell A',
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
                      text: 'Cell B',
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
    ])
    expect(xml).toContain('<grid id="g1" cols="2" gap="16px">')
    expect(xml).toContain('<cell>')
    expect(xml).toContain('<p>Cell A</p>')
    expect(xml).toContain('<p>Cell B</p>')
    expect(xml).toContain('</grid>')
  })

  it('agent-diff', () => {
    const xml = serialize([
      {
        type: 'agent-diff',
        $: { blockId: 'ad1' },
        opType: 'replace',
        diffEntryId: 'diff-123',
        version: 1,
      },
    ])
    expect(xml).toContain('<agent-diff id="ad1" op="replace" entry="diff-123" />')
  })

  it('code-snippet', () => {
    const xml = serialize([
      {
        type: 'code-snippet',
        $: { blockId: 'cs1' },
        files: [
          { filename: 'index.ts', code: 'export {}', language: 'ts' },
          { filename: 'main.ts', code: 'console.log(1)', language: 'ts' },
        ],
        version: 1,
      },
    ])
    expect(xml).toContain('<code-snippet id="cs1">')
    expect(xml).toContain('<file name="index.ts" lang="ts">export {}</file>')
    expect(xml).toContain('<file name="main.ts" lang="ts">console.log(1)</file>')
  })

  it('comment', () => {
    const xml = serialize([
      {
        type: 'paragraph',
        $: { blockId: 'p1' },
        children: [
          {
            type: 'comment',
            text: 'a comment',
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
    ])
    expect(xml).toContain('<comment>a comment</comment>')
  })

  it('poll', () => {
    const xml = serialize([
      {
        type: 'poll',
        $: { blockId: 'pl1' },
        pollId: 'p_abc',
        question: 'Which one?',
        options: [
          { id: 'o_a', label: 'Option A' },
          { id: 'o_b', label: 'Option B' },
        ],
        mode: 'multiple',
        closeAt: '2026-05-01T00:00:00Z',
        showResults: 'after-vote',
        version: 1,
      },
    ])
    expect(xml).toContain(
      '<poll id="pl1" poll-id="p_abc" mode="multiple" close-at="2026-05-01T00:00:00Z" show-results="after-vote">',
    )
    expect(xml).toContain('<question>Which one?</question>')
    expect(xml).toContain('<option id="o_a">Option A</option>')
    expect(xml).toContain('<option id="o_b">Option B</option>')
  })
})

function parse(xml: string) {
  const registry = new LitexmlRegistry()
  registerBuiltinReaders(registry)
  registerCustomReaders(registry)
  const state = deserializeFromXml(`<doc>${xml}</doc>`, registry)
  return (state.root as any).children
}

describe('custom readers', () => {
  it('reads <img />', () => {
    const nodes = parse('<img id="i1" src="/a.jpg" alt="Photo" width="800" />')
    expect(nodes[0].type).toBe('image')
    expect(nodes[0].src).toBe('/a.jpg')
    expect(nodes[0].altText).toBe('Photo')
    expect(nodes[0].width).toBe(800)
    expect(nodes[0].$?.blockId).toBe('i1')
  })

  it('reads <img /> display-width and layout', () => {
    const nodes = parse('<img src="/a.jpg" alt="A" display-width="60" layout="float-right" />')
    expect(nodes[0].displayWidth).toBe(60)
    expect(nodes[0].layout).toBe('float-right')
  })

  it('rejects invalid <img /> layout values', () => {
    const nodes = parse('<img src="/a.jpg" alt="A" layout="banana" />')
    expect(nodes[0].layout).toBeUndefined()
  })

  it('rejects out-of-range or non-numeric <img /> display-width', () => {
    expect(parse('<img src="/a.jpg" alt="A" display-width="5" />')[0].displayWidth).toBeUndefined()
    expect(
      parse('<img src="/a.jpg" alt="A" display-width="150" />')[0].displayWidth,
    ).toBeUndefined()
    expect(
      parse('<img src="/a.jpg" alt="A" display-width="abc" />')[0].displayWidth,
    ).toBeUndefined()
  })

  it('reads <img /> fixed-width and fixed-height', () => {
    expect(parse('<img src="/a.jpg" alt="A" fixed-width="360" />')[0].fixedWidth).toBe(360)
    expect(parse('<img src="/a.jpg" alt="A" fixed-height="240" />')[0].fixedHeight).toBe(240)
  })

  it('rejects invalid <img /> fixed-width and fixed-height', () => {
    expect(parse('<img src="/a.jpg" alt="A" fixed-width="0" />')[0].fixedWidth).toBeUndefined()
    expect(parse('<img src="/a.jpg" alt="A" fixed-width="-8" />')[0].fixedWidth).toBeUndefined()
    expect(parse('<img src="/a.jpg" alt="A" fixed-height="abc" />')[0].fixedHeight).toBeUndefined()
  })

  it('keeps only display-width when multiple image size attributes are present', () => {
    const node = parse(
      '<img src="/a.jpg" alt="A" display-width="50" fixed-width="360" fixed-height="240" />',
    )[0]
    expect(node.displayWidth).toBe(50)
    expect(node.fixedWidth).toBeUndefined()
    expect(node.fixedHeight).toBeUndefined()
  })

  it('reads <video />', () => {
    const nodes = parse('<video id="v1" src="/clip.mp4" poster="/thumb.jpg" />')
    expect(nodes[0].type).toBe('video')
    expect(nodes[0].src).toBe('/clip.mp4')
    expect(nodes[0].poster).toBe('/thumb.jpg')
  })

  it('reads <attachment />', () => {
    const nodes = parse(
      '<attachment src="/spec.pdf" name="design-spec.pdf" size="2457600" mime-type="application/pdf" ext="pdf" />',
    )
    expect(nodes[0].type).toBe('file')
    expect(nodes[0].src).toBe('/spec.pdf')
    expect(nodes[0].name).toBe('design-spec.pdf')
    expect(nodes[0].size).toBe(2_457_600)
    expect(nodes[0].mimeType).toBe('application/pdf')
    expect(nodes[0].ext).toBe('pdf')
    expect(nodes[0].display).toBe('block')
    expect(parse('<attachment src="/a.md" name="a.md" display="inline" />')[0].display).toBe(
      'inline',
    )
  })

  it('reads <codeblock>', () => {
    const nodes = parse('<codeblock id="cb1" lang="ts">const x = 1</codeblock>')
    expect(nodes[0].type).toBe('code-block')
    expect(nodes[0].code).toBe('const x = 1')
    expect(nodes[0].language).toBe('ts')
  })

  it('reads <codeblock> CDATA without dropping code content', () => {
    const code = [
      '#!/usr/bin/env node',
      'import { spawnSync } from \'node:child_process\'',
      'for (const [cmd, args] of steps) {',
      // eslint-disable-next-line no-template-curly-in-string -- the code being stored
      '  console.log(`run ${cmd} ${args.join(\' \')}`)',
      '  if (r.status !== 0) process.exit(r.status ?? 1)',
      '}',
    ].join('\n')
    const nodes = parse(`<codeblock id="cb1" lang="js"><![CDATA[${code}]]></codeblock>`)
    expect(nodes[0].type).toBe('code-block')
    expect(nodes[0].code).toBe(code)
    expect(nodes[0].language).toBe('js')
  })

  it('reads <math display="block">', () => {
    const nodes = parse('<math id="kb1" display="block">E=mc^2</math>')
    expect(nodes[0].type).toBe('katex-block')
    expect(nodes[0].equation).toBe('E=mc^2')
  })

  it('reads inline <math>', () => {
    const nodes = parse('<p id="p1">Energy: <math>E=mc^2</math></p>')
    const inline = nodes[0].children[1]
    expect(inline.type).toBe('katex-inline')
    expect(inline.equation).toBe('E=mc^2')
  })

  it('reads inline <math color="..."> and preserves color', () => {
    const nodes = parse('<p id="p1"><math color="#ef4444">E=mc^2</math></p>')
    const inline = nodes[0].children[0]
    expect(inline.type).toBe('katex-inline')
    expect(inline.color).toBe('#ef4444')
  })

  it('reads <alert>', () => {
    const nodes = parse('<alert id="aq1" type="warning"><p>Be careful</p></alert>')
    expect(nodes[0].type).toBe('alert-quote')
    expect(nodes[0].alertType).toBe('warning')
    expect(nodes[0].content.root.children[0].type).toBe('paragraph')
  })

  it('reads <details>', () => {
    const nodes = parse('<details id="d1" summary="Click" open="true"><p>content</p></details>')
    expect(nodes[0].type).toBe('details')
    expect(nodes[0].summary).toBe('Click')
    expect(nodes[0].open).toBe(true)
    expect(nodes[0].children[0].type).toBe('paragraph')
  })

  it('reads <mention>', () => {
    const nodes = parse('<p id="p1"><mention platform="github" handle="octocat">Octocat</mention></p>')
    const m = nodes[0].children[0]
    expect(m.type).toBe('mention')
    expect(m.platform).toBe('github')
    expect(m.handle).toBe('octocat')
    expect(m.displayName).toBe('Octocat')
  })

  it('reads <tag>', () => {
    const nodes = parse('<p id="p1"><tag>AI</tag></p>')
    expect(nodes[0].children[0].type).toBe('tag')
    expect(nodes[0].children[0].text).toBe('AI')
  })

  it('reads <comment>', () => {
    const nodes = parse('<p id="p1"><comment>a comment</comment></p>')
    expect(nodes[0].children[0].type).toBe('comment')
    expect(nodes[0].children[0].text).toBe('a comment')
  })

  it('reads <spoiler>', () => {
    const nodes = parse('<p id="p1"><spoiler>hidden</spoiler></p>')
    expect(nodes[0].children[0].type).toBe('spoiler')
    expect(nodes[0].children[0].children[0].text).toBe('hidden')
  })

  it('reads <ruby>', () => {
    const nodes = parse('<p id="p1"><ruby rt="きょう">今日</ruby></p>')
    expect(nodes[0].children[0].type).toBe('ruby')
    expect(nodes[0].children[0].reading).toBe('きょう')
  })

  it('reads <footnote />', () => {
    const nodes = parse('<p id="p1">text<footnote ref="1" /></p>')
    const fn = nodes[0].children[1]
    expect(fn.type).toBe('footnote')
    expect(fn.identifier).toBe('1')
  })

  it('reads <footnote-section>', () => {
    const nodes = parse(
      '<footnote-section id="fs1"><def ref="1">Note one</def></footnote-section>',
    )
    expect(nodes[0].type).toBe('footnote-section')
    expect(nodes[0].definitions['1']).toBe('Note one')
  })

  it('reads <link-card />', () => {
    const nodes = parse('<link-card id="lc1" url="https://example.com" title="Ex" />')
    expect(nodes[0].type).toBe('link-card')
    expect(nodes[0].url).toBe('https://example.com')
  })

  it('reads <embed />', () => {
    const nodes = parse('<embed id="e1" url="https://youtube.com/123" source="youtube" />')
    expect(nodes[0].type).toBe('embed')
  })

  it('reads <mermaid>', () => {
    const nodes = parse('<mermaid id="m1">graph LR</mermaid>')
    expect(nodes[0].type).toBe('mermaid')
    expect(nodes[0].diagram).toBe('graph LR')
  })

  it('reads <gallery>', () => {
    const nodes = parse(
      '<gallery id="g1" layout="grid"><img src="/a.jpg" alt="A" /><img src="/b.jpg" alt="B" /></gallery>',
    )
    expect(nodes[0].type).toBe('gallery')
    expect(nodes[0].layout).toBe('grid')
    expect(nodes[0].images).toHaveLength(2)
    expect(nodes[0].images[0].src).toBe('/a.jpg')
  })

  it('reads <gallery> with no new attributes and applies defaults', () => {
    const nodes = parse('<gallery layout="grid"><img src="/a.jpg" alt="A" /></gallery>')
    expect(nodes[0].aspect).toBe('auto')
    expect(nodes[0].fit).toBe('cover')
    expect(nodes[0].maxItemHeight).toBeUndefined()
  })

  it('reads <gallery> aspect, fit, and max-item-height', () => {
    const nodes = parse(
      '<gallery layout="masonry" aspect="16:9" fit="contain" max-item-height="480"><img src="/a.jpg" alt="A" /></gallery>',
    )
    expect(nodes[0].aspect).toBe('16:9')
    expect(nodes[0].fit).toBe('contain')
    expect(nodes[0].maxItemHeight).toBe(480)
  })

  it('rejects invalid <gallery> aspect, fit, and max-item-height values', () => {
    const nodes = parse(
      '<gallery aspect="banana" fit="squish" max-item-height="-3"><img src="/a.jpg" alt="A" /></gallery>',
    )
    expect(nodes[0].aspect).toBe('auto')
    expect(nodes[0].fit).toBe('cover')
    expect(nodes[0].maxItemHeight).toBeUndefined()

    const nodes2 = parse('<gallery max-item-height="abc"><img src="/a.jpg" alt="A" /></gallery>')
    expect(nodes2[0].maxItemHeight).toBeUndefined()
  })

  it('reads <code-snippet>', () => {
    const nodes = parse(
      '<code-snippet id="cs1"><file name="index.ts" lang="ts">export {}</file></code-snippet>',
    )
    expect(nodes[0].type).toBe('code-snippet')
    expect(nodes[0].files[0].filename).toBe('index.ts')
    expect(nodes[0].files[0].code).toBe('export {}')
  })

  it('reads <banner>', () => {
    const nodes = parse('<banner id="b1" type="tip"><p>Tip content</p></banner>')
    expect(nodes[0].type).toBe('banner')
    expect(nodes[0].bannerType).toBe('tip')
    expect(nodes[0].content.root.children[0].type).toBe('paragraph')
  })

  it('reads <excalidraw> with CDATA', () => {
    const nodes = parse('<excalidraw id="ex1"><![CDATA[{"elements":[]}]]></excalidraw>')
    expect(nodes[0].type).toBe('excalidraw')
    expect(nodes[0].snapshot).toBe('{"elements":[]}')
    expect(nodes[0].$?.blockId).toBe('ex1')
  })

  it('reads <excalidraw> with a remote URL body', () => {
    const nodes = parse(
      '<excalidraw id="ex1">https://cdn.example.com/diagram.excalidraw</excalidraw>',
    )
    expect(nodes[0].type).toBe('excalidraw')
    expect(nodes[0].snapshot).toBe('https://cdn.example.com/diagram.excalidraw')
  })

  it('reads <excalidraw> with snapshot attribute (backward compat)', () => {
    const nodes = parse('<excalidraw id="ex1" snapshot="{&quot;elements&quot;:[]}" />')
    expect(nodes[0].type).toBe('excalidraw')
    expect(nodes[0].snapshot).toBe('{"elements":[]}')
  })

  it('reads <excalidraw /> with empty snapshot', () => {
    const nodes = parse('<excalidraw id="ex2" />')
    expect(nodes[0].type).toBe('excalidraw')
    expect(nodes[0].snapshot).toBe('')
  })

  it('reads <chart> CDATA as the raw spec string', () => {
    const nodes = parse('<chart id="c1">\n  <![CDATA[{"type":"line"}]]>\n</chart>')
    expect(nodes[0]).toEqual({
      type: 'chart',
      $: { blockId: 'c1' },
      spec: '{"type":"line"}',
      version: 1,
    })
  })

  it('reads plain-text <chart> body trimmed', () => {
    const nodes = parse('<chart>\n  {"type":"pie"}\n</chart>')
    expect(nodes[0].spec).toBe('{"type":"pie"}')
  })

  it('reads <dynamic> with props CDATA', () => {
    const nodes = parse(
      '<dynamic id="dyn1" url="https://cdn.example.com/widget.mjs" initial-height="480"><![CDATA[{"level":1}]]></dynamic>',
    )
    expect(nodes[0].type).toBe('dynamic')
    expect(nodes[0].url).toBe('https://cdn.example.com/widget.mjs')
    expect(nodes[0].initialHeight).toBe(480)
    expect(nodes[0].props).toEqual({ level: 1 })
    expect(nodes[0].$?.blockId).toBe('dyn1')
  })

  it('reads self-closing <dynamic /> with defaults', () => {
    const nodes = parse('<dynamic id="dyn2" url="https://cdn.example.com/widget.mjs" />')
    expect(nodes[0].type).toBe('dynamic')
    expect(nodes[0].props).toEqual({})
    expect(nodes[0].initialHeight).toBe(320)
  })

  it('reads <dynamic> with malformed props as empty object', () => {
    const nodes = parse(
      '<dynamic id="dyn3" url="https://cdn.example.com/widget.mjs"><![CDATA[{broken]]></dynamic>',
    )
    expect(nodes[0].type).toBe('dynamic')
    expect(nodes[0].props).toEqual({})
  })

  it('reads <grid>', () => {
    const nodes = parse(
      '<grid id="g1" cols="3" gap="8px"><cell><p>A</p></cell><cell><p>B</p></cell><cell><p>C</p></cell></grid>',
    )
    expect(nodes[0].type).toBe('grid-container')
    expect(nodes[0].cols).toBe(3)
    expect(nodes[0].gap).toBe('8px')
    expect(nodes[0].cells).toHaveLength(3)
    expect(nodes[0].cells[0].root.children[0].type).toBe('paragraph')
  })

  it('reads <grid> with default cols', () => {
    const nodes = parse('<grid><cell><p>A</p></cell></grid>')
    expect(nodes[0].type).toBe('grid-container')
    expect(nodes[0].cols).toBe(2)
    expect(nodes[0].gap).toBe('16px')
  })

  it('reads <agent-diff />', () => {
    const nodes = parse('<agent-diff id="ad1" op="replace" entry="diff-123" />')
    expect(nodes[0].type).toBe('agent-diff')
    expect(nodes[0].opType).toBe('replace')
    expect(nodes[0].diffEntryId).toBe('diff-123')
  })

  it('reads <poll>', () => {
    const nodes = parse(
      '<poll id="pl1" poll-id="p_abc" mode="multiple" close-at="2026-05-01" show-results="after-vote"><question>Which one?</question><option id="o_a">Option A</option><option id="o_b">Option B</option></poll>',
    )
    expect(nodes[0].type).toBe('poll')
    expect(nodes[0].pollId).toBe('p_abc')
    expect(nodes[0].question).toBe('Which one?')
    expect(nodes[0].mode).toBe('multiple')
    expect(nodes[0].closeAt).toBe('2026-05-01')
    expect(nodes[0].showResults).toBe('after-vote')
    expect(nodes[0].options).toEqual([
      { id: 'o_a', label: 'Option A' },
      { id: 'o_b', label: 'Option B' },
    ])
  })

  it('reads <poll> mints IDs when missing (agent creates fresh)', () => {
    const nodes = parse(
      '<poll mode="single"><question>Pick one</question><option>A</option><option>B</option></poll>',
    )
    expect(nodes[0].type).toBe('poll')
    expect(nodes[0].mode).toBe('single')
    expect(typeof nodes[0].pollId).toBe('string')
    expect((nodes[0].pollId as string).startsWith('p_')).toBe(true)
    expect(nodes[0].options).toHaveLength(2)
    expect((nodes[0].options[0].id as string).startsWith('o_')).toBe(true)
    expect(nodes[0].options[0].label).toBe('A')
  })
})

describe('reading what other nodes hold', () => {
  it('does not normalize inside CDATA sections', () => {
    const registry = createDefaultRegistry()
    const xml
      = '<doc><codeblock lang="xml"><![CDATA[<self-closing attr="x" />]]></codeblock><p>after</p></doc>'
    const state = deserializeFromXml(xml, registry)
    const children = (state.root as any).children
    expect(children.map((c: any) => c.type)).toEqual(['code-block', 'paragraph'])
    // CDATA contents preserved verbatim including the `/>`
    expect(children[0].code).toContain('<self-closing attr="x" />')
  })

  it('coalesces adjacent text nodes from character references', () => {
    const registry = createDefaultRegistry()
    const xml = '<doc><p>before <code>&lt;alert&gt;</code> after</p></doc>'
    const state = deserializeFromXml(xml, registry)
    const para = (state.root as any).children[0]
    expect(para.type).toBe('paragraph')
    const kids = para.children
    expect(kids).toHaveLength(3)
    expect(kids[0].text).toBe('before ')
    expect(kids[0].format).toBe(0)
    expect(kids[1].text).toBe('<alert>')
    expect(kids[1].format).not.toBe(0)
    expect(kids[2].text).toBe(' after')
    expect(kids[2].format).toBe(0)
  })

  it('coalesces adjacent text but keeps nested format elements separate', () => {
    const registry = createDefaultRegistry()
    const xml = '<doc><p>a<b>bold</b>b&lt;c</p></doc>'
    const state = deserializeFromXml(xml, registry)
    const kids = (state.root as any).children[0].children
    expect(kids.map((k: any) => k.text)).toEqual(['a', 'bold', 'b<c'])
  })

  it('drops indentation around a block child inside a paragraph', () => {
    const xml = `<doc>
  <p id="p1">
    <excalidraw id="e1"></excalidraw>
  </p>
</doc>`
    const children = (deserializeFromXml(xml, createDefaultRegistry()).root as any).children[0].children
    expect(children.map((c: any) => c.type)).toEqual(['excalidraw'])
  })

  it('keeps CDATA verbatim and unescapes text that has none', () => {
    const xml = '<doc><chart><![CDATA[{"a":"<b> & c"}\nline two]]></chart><excalidraw><![CDATA[{"x":"<&>"}]]></excalidraw><codeblock lang="html">&lt;div&gt; &amp; text</codeblock></doc>'
    const [chart, drawing, code] = (deserializeFromXml(xml, createDefaultRegistry()).root as any).children
    expect(chart).toMatchObject({ type: 'chart', spec: '{"a":"<b> & c"}\nline two' })
    expect(drawing).toMatchObject({ type: 'excalidraw', snapshot: '{"x":"<&>"}' })
    expect(code).toMatchObject({ type: 'code-block', language: 'html', code: '<div> & text' })
  })

  it('keeps what is inside a tag it has no reader for, restores <node>, and makes missing ids', () => {
    const xml = `<doc>
  <section><p>inside</p></section>
  <node type="x" data='{"a":1}' />
  <steps><step title="一"><p>a</p></step></steps>
  <chat><participants><participant kind="user" name="我" /></participants><messages><message participant="p_x">hi</message></messages></chat>
  <poll><question>Q</question><option>A</option></poll>
</doc>`
    const [section, node, steps, chat, poll] = (deserializeFromXml(xml, createDefaultRegistry()).root as any).children
    expect(section).toMatchObject({
      type: 'paragraph',
      children: [
        { text: 'inside' },
      ],
    })
    expect(node).toEqual({ type: 'x', a: 1, version: 1 })
    expect(steps.steps[0].id).toMatch(/^s_[a-z0-9]{8}$/)
    expect(chat.participants[0].id).toMatch(/^p_[a-z0-9]{6}$/)
    expect(chat.messages[0].id).toMatch(/^m_[a-z0-9]{8}$/)
    expect(poll.pollId).toMatch(/^p_[a-z0-9]{10}$/)
    expect(poll.options[0].id).toMatch(/^o_[a-z0-9]{6}$/)
  })
})

describe('gallery perView', () => {
  const node = (extra: Record<string, unknown>) => ({
    type: 'gallery',
    images: [
      { src: '/a.jpg', alt: 'A' },
    ],
    layout: 'carousel',
    version: 1,
    ...extra,
  })
  const galleryXml = (xml: string) => xml.match(/<gallery[\s\S]*<\/gallery>/)![0]

  it('writes per-view and reads it back', () => {
    const xml = serialize([
      node({ perView: 1.5 }),
    ])
    expect(xml).toContain('<gallery layout="carousel" per-view="1.5">')
    expect(parse(galleryXml(xml))[0].perView).toBe(1.5)
  })

  it('writes nothing for one or none, and reads no field back', () => {
    for (const extra of [
      {},
      { perView: 1 },
    ]) {
      const xml = serialize([
        node(extra),
      ])
      expect(xml).not.toContain('per-view')
      expect('perView' in parse(galleryXml(xml))[0]).toBe(false)
    }
  })

  it('reads only the listed counts', () => {
    const read = (value: string) => parse(`<gallery layout="carousel" per-view="${value}"><img src="/a.jpg" alt="A" /></gallery>`)[0]
    expect(read('2.5').perView).toBe(2.5)
    for (const value of ['1.3', 'abc', '-2', '1'])
      expect('perView' in read(value)).toBe(false)
  })
})
