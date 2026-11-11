import type { SerializedEditorState } from 'lexical'
import { describe, expect, it } from 'vitest'

import { deserializeFromXml } from '../src/deserializer'
import { registerBuiltinReaders } from '../src/readers/builtin'
import { LitexmlRegistry } from '../src/registry'
import { serializeToXml } from '../src/serializer'

import { registerBuiltinWriters } from '../src/writers/builtin'
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
  return serializeToXml(makeState(children), registry)
}

function TEXT(text: string, format = 0) {
  return {
    type: 'text',
    text,
    format,
    detail: 0,
    mode: 'normal',
    style: '',
    version: 1,
  }
}

describe('builtin writers', () => {
  it('paragraph', () => {
    const xml = serialize([
      {
        type: 'paragraph',
        $: { blockId: 'p1' },
        children: [
          TEXT('hello'),
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
        version: 1,
      },
    ])
    expect(xml).toContain('<p id="p1">hello</p>')
  })

  it('heading h2', () => {
    const xml = serialize([
      {
        type: 'heading',
        tag: 'h2',
        $: { blockId: 'h1' },
        children: [
          TEXT('Title'),
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
        version: 1,
      },
    ])
    expect(xml).toContain('<h2 id="h1">Title</h2>')
  })

  it('paragraph with formatted text', () => {
    const xml = serialize([
      {
        type: 'paragraph',
        $: { blockId: 'p2' },
        children: [
          TEXT('normal '),
          TEXT('bold', 1),
          TEXT(' end'),
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
        version: 1,
      },
    ])
    expect(xml).toContain('<p id="p2">normal <b>bold</b> end</p>')
  })

  it('quote', () => {
    const xml = serialize([
      {
        type: 'quote',
        $: { blockId: 'q1' },
        children: [
          TEXT('quoted'),
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
        version: 1,
      },
    ])
    expect(xml).toContain('<blockquote id="q1">quoted</blockquote>')
  })

  it('rich-quote with attribution', () => {
    const xml = serialize([
      {
        type: 'rich-quote',
        $: { blockId: 'q1' },
        attribution: '— Author, Work',
        children: [
          TEXT('quoted'),
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
        version: 1,
      },
    ])
    expect(xml).toContain('<blockquote id="q1" attribution="— Author, Work">quoted</blockquote>')
  })

  it('quote without attribution emits no attribute', () => {
    const xml = serialize([
      {
        type: 'quote',
        $: { blockId: 'q1' },
        children: [
          TEXT('quoted'),
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
        version: 1,
      },
    ])
    expect(xml).toContain('<blockquote id="q1">quoted</blockquote>')
  })

  // A rich quote and a plain quote share the `<blockquote>` tag, and the writer
  // drops empty attribute values, so a rich quote with no attribution needs an
  // explicit flag. Without it the reader cannot recover the node type.
  it('rich quote without attribution emits the rich flag', () => {
    const base = {
      $: { blockId: 'q1' },
      children: [
        TEXT('quoted'),
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      textFormat: 0,
      textStyle: '',
      version: 1,
    }
    for (const attribution of [null, undefined, '', '   ']) {
      const xml = serialize([
        { type: 'rich-quote', attribution, ...base },
      ])
      expect(xml).not.toContain('attribution=')
      expect(xml).toContain('<blockquote id="q1" rich="true">quoted</blockquote>')
    }
  })

  it('horizontal rule', () => {
    const xml = serialize([
      {
        type: 'horizontalrule',
        $: { blockId: 'hr1' },
        version: 1,
      },
    ])
    expect(xml).toContain('<hr id="hr1" />')
  })

  it('unordered list', () => {
    const xml = serialize([
      {
        type: 'list',
        listType: 'bullet',
        $: { blockId: 'ul1' },
        children: [
          {
            type: 'listitem',
            $: { blockId: 'li1' },
            children: [
              TEXT('item 1'),
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
            version: 1,
            value: 1,
          },
          {
            type: 'listitem',
            $: { blockId: 'li2' },
            children: [
              TEXT('item 2'),
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
            version: 1,
            value: 2,
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        start: 1,
        version: 1,
        tag: 'ul',
      },
    ])
    expect(xml).toContain('<ul id="ul1">')
    expect(xml).toContain('<li id="li1">item 1</li>')
    expect(xml).toContain('<li id="li2">item 2</li>')
    expect(xml).toContain('</ul>')
  })

  it('ordered list', () => {
    const xml = serialize([
      {
        type: 'list',
        listType: 'number',
        $: { blockId: 'ol1' },
        children: [
          {
            type: 'listitem',
            $: { blockId: 'li1' },
            children: [
              TEXT('first'),
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
            version: 1,
            value: 1,
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        start: 1,
        version: 1,
        tag: 'ol',
      },
    ])
    expect(xml).toContain('<ol id="ol1">')
  })

  it('checklist', () => {
    const xml = serialize([
      {
        type: 'list',
        listType: 'check',
        $: { blockId: 'cl1' },
        children: [
          {
            type: 'listitem',
            $: { blockId: 'li1' },
            checked: true,
            children: [
              TEXT('done'),
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
            version: 1,
            value: 1,
          },
          {
            type: 'listitem',
            $: { blockId: 'li2' },
            checked: false,
            children: [
              TEXT('todo'),
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
            version: 1,
            value: 2,
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        start: 1,
        version: 1,
        tag: 'ul',
      },
    ])
    expect(xml).toContain('<ul id="cl1" type="check">')
    expect(xml).toContain('checked="true"')
    expect(xml).toContain('checked="false"')
  })

  it('link wrapping text', () => {
    const xml = serialize([
      {
        type: 'paragraph',
        $: { blockId: 'p1' },
        children: [
          {
            type: 'link',
            url: 'https://example.com',
            children: [
              TEXT('click'),
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            rel: null,
            target: null,
            title: null,
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
    expect(xml).toContain('<a href="https://example.com">click</a>')
  })

  it('table', () => {
    const xml = serialize([
      {
        type: 'table',
        $: { blockId: 't1' },
        children: [
          {
            type: 'tablerow',
            children: [
              {
                type: 'tablecell',
                headerState: 1,
                children: [
                  {
                    type: 'paragraph',
                    children: [
                      TEXT('Header'),
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
                type: 'tablecell',
                headerState: 0,
                children: [
                  {
                    type: 'paragraph',
                    children: [
                      TEXT('Cell'),
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
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
      },
    ])
    expect(xml).toContain('<table id="t1">')
    expect(xml).toContain('<th>')
    expect(xml).toContain('<td>')
  })
})

function parse(xml: string) {
  const registry = new LitexmlRegistry()
  registerBuiltinReaders(registry)
  const state = deserializeFromXml(`<doc>${xml}</doc>`, registry)
  return (state.root as any).children
}

describe('builtin readers', () => {
  it('reads <p>', () => {
    const nodes = parse('<p id="p1">hello</p>')
    expect(nodes).toHaveLength(1)
    expect(nodes[0].type).toBe('paragraph')
    expect(nodes[0].$?.blockId).toBe('p1')
    expect(nodes[0].children[0].type).toBe('text')
    expect(nodes[0].children[0].text).toBe('hello')
  })

  it('reads <h3>', () => {
    const nodes = parse('<h3 id="h1">Title</h3>')
    expect(nodes[0].type).toBe('heading')
    expect(nodes[0].tag).toBe('h3')
  })

  it('reads <blockquote>', () => {
    const nodes = parse('<blockquote id="q1">text</blockquote>')
    expect(nodes[0].type).toBe('quote')
  })

  it('reads <blockquote attribution="...">', () => {
    const nodes = parse('<blockquote id="q2" attribution="— Wang Xizhi">text</blockquote>')
    expect(nodes[0].type).toBe('rich-quote')
    expect(nodes[0].attribution).toBe('— Wang Xizhi')
    expect(nodes[0].$?.blockId).toBe('q2')
    expect(nodes[0].children[0].type).toBe('text')
    expect(nodes[0].children[0].text).toBe('text')
  })

  it('reads <blockquote> without attribution as type quote', () => {
    const nodes = parse('<blockquote id="q3">text</blockquote>')
    expect(nodes[0].type).toBe('quote')
    expect(nodes[0].attribution).toBeUndefined()
  })

  it('ignores formatting whitespace around blockquote block children', () => {
    const nodes = parse(`
      <blockquote id="q1">
        <p>&quot;loadHome 為什麼要 fetch 這些資料。&quot;</p>
      </blockquote>
    `)
    const quote = nodes[0]
    const paragraph = quote.children[0]
    const text = paragraph.children.map((child: any) => child.text).join('')

    expect(quote.type).toBe('quote')
    expect(quote.$?.blockId).toBe('q1')
    expect(quote.children).toHaveLength(1)
    expect(paragraph.type).toBe('paragraph')
    expect(text).toBe('"loadHome 為什麼要 fetch 這些資料。"')
  })

  it('reads <hr />', () => {
    const nodes = parse('<hr id="hr1" />')
    expect(nodes[0].type).toBe('horizontalrule')
  })

  it('reads <ul> with <li>', () => {
    const nodes = parse('<ul id="ul1"><li id="li1">item</li></ul>')
    expect(nodes[0].type).toBe('list')
    expect(nodes[0].listType).toBe('bullet')
    expect(nodes[0].children[0].type).toBe('listitem')
  })

  it('reads <ol>', () => {
    const nodes = parse('<ol id="ol1"><li id="li1">item</li></ol>')
    expect(nodes[0].listType).toBe('number')
  })

  it('reads checklist', () => {
    const nodes = parse('<ul type="check" id="cl1"><li checked="true" id="li1">done</li></ul>')
    expect(nodes[0].listType).toBe('check')
    expect(nodes[0].children[0].checked).toBe(true)
  })

  it('reads <a>', () => {
    const nodes = parse('<p id="p1"><a href="https://example.com">link</a></p>')
    const link = nodes[0].children[0]
    expect(link.type).toBe('link')
    expect(link.url).toBe('https://example.com')
    expect(link.children[0].text).toBe('link')
  })

  it('reads formatted text', () => {
    const nodes = parse('<p id="p1">plain <b>bold</b> <b><i>both</i></b></p>')
    const children = nodes[0].children
    expect(children[0].text).toBe('plain ')
    expect(children[0].format).toBe(0)
    expect(children[1].text).toBe('bold')
    expect(children[1].format).toBe(1) // bold
    expect(children[2].text).toBe(' ')
    expect(children[2].format).toBe(0)
    expect(children[3].text).toBe('both')
    expect(children[3].format).toBe(3) // bold + italic
  })

  it('reads table', () => {
    const nodes = parse('<table id="t1"><tr><th><p>H</p></th><td><p>C</p></td></tr></table>')
    expect(nodes[0].type).toBe('table')
    const row = nodes[0].children[0]
    expect(row.type).toBe('tablerow')
    expect(row.children[0].type).toBe('tablecell')
    expect(row.children[0].headerState).toBe(1)
    expect(row.children[1].headerState).toBe(0)
  })
})

/** The expected values for the same input. */
const SAMPLE_DOCUMENT = {
  root: {
    type: 'root',
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
    children: [
      {
        type: 'heading',
        tag: 'h2',
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
        children: [
          {
            type: 'text',
            text: '標題',
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
        ],
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
            text: 'Hello ',
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
          {
            type: 'text',
            text: 'world',
            format: 1,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
          {
            type: 'text',
            text: ' and ',
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
          {
            type: 'text',
            text: 'a < b & c',
            format: 16,
            detail: 0,
            mode: 'normal',
            style: '',
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
            type: 'link',
            url: 'https://example.com/?a=1&b=2',
            target: null,
            rel: 'noopener',
            title: null,
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            children: [
              {
                type: 'text',
                text: 'link',
                format: 0,
                detail: 0,
                mode: 'normal',
                style: '',
                version: 1,
              },
            ],
          },
          {
            type: 'linebreak',
            version: 1,
          },
          {
            type: 'text',
            text: 'second line',
            format: 2,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
        ],
      },
      {
        type: 'list',
        listType: 'bullet',
        start: 1,
        tag: 'ul',
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
        children: [
          {
            type: 'listitem',
            value: 1,
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            children: [
              {
                type: 'text',
                text: 'one',
                format: 0,
                detail: 0,
                mode: 'normal',
                style: '',
                version: 1,
              },
            ],
          },
          {
            type: 'listitem',
            value: 2,
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            children: [
              {
                type: 'text',
                text: 'two',
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
        type: 'list',
        listType: 'check',
        start: 1,
        tag: 'ul',
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
        children: [
          {
            type: 'listitem',
            value: 1,
            checked: true,
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            children: [
              {
                type: 'text',
                text: 'done',
                format: 0,
                detail: 0,
                mode: 'normal',
                style: '',
                version: 1,
              },
            ],
          },
          {
            type: 'listitem',
            value: 2,
            checked: false,
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            children: [
              {
                type: 'text',
                text: 'todo',
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
        type: 'list',
        listType: 'number',
        start: 1,
        tag: 'ol',
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
        children: [
          {
            type: 'listitem',
            value: 1,
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            children: [
              {
                type: 'text',
                text: 'first',
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
        type: 'table',
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
        children: [
          {
            type: 'tablerow',
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            children: [
              {
                type: 'tablecell',
                headerState: 1,
                colSpan: 1,
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
                    children: [
                      {
                        type: 'text',
                        text: 'H',
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
                type: 'tablecell',
                headerState: 1,
                colSpan: 1,
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
                    children: [
                      {
                        type: 'text',
                        text: 'I',
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
          {
            type: 'tablerow',
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            children: [
              {
                type: 'tablecell',
                headerState: 0,
                colSpan: 1,
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
                    children: [
                      {
                        type: 'text',
                        text: '1',
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
                type: 'tablecell',
                headerState: 0,
                colSpan: 1,
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
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'horizontalrule',
        version: 1,
      },
      {
        type: 'quote',
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
        children: [
          {
            type: 'text',
            text: '引用',
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
        ],
      },
      {
        type: 'rich-quote',
        attribution: '— 作者',
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
            children: [
              {
                type: 'text',
                text: '名言',
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

const SAMPLE_DOCUMENT_XML = '<doc>\n  <h2>標題</h2>\n  <p>Hello <b>world</b> and <code>a &lt; b &amp; c</code> <a href="https://example.com/?a=1&amp;b=2" rel="noopener">link</a><br /><i>second line</i></p>\n  <ul>\n    <li>one</li>\n    <li>two</li>\n  </ul>\n  <ul type="check">\n    <li checked="true">done</li>\n    <li checked="false">todo</li>\n  </ul>\n  <ol>\n    <li>first</li>\n  </ol>\n  <table>\n    <tr>\n      <th>\n        <p>H</p>\n      </th>\n      <th>\n        <p>I</p>\n      </th>\n    </tr>\n    <tr>\n      <td>\n        <p>1</p>\n      </td>\n      <td>\n        <p />\n      </td>\n    </tr>\n  </table>\n  <hr />\n  <blockquote>引用</blockquote>\n  <blockquote attribution="— 作者">\n    <p>名言</p>\n  </blockquote>\n</doc>\n'

const ALIASES_XML = '<doc>\n  <p>a <strong>b</strong> <em>c</em> <del>d</del> <strike>e</strike> <u>f</u> <sub>g</sub><sup>h</sup><mark>i</mark></p>\n  <hr />\n  <h3>  spaced  title </h3>\n  <ul>\n    <li>x</li>\n    <li checked="false">y</li>\n  </ul>\n  <ol start="3"><li>z</li></ol>\n  <blockquote rich="true">\n    <p>q</p>\n  </blockquote>\n  <p>line<br/>break</p>\n  <a href="https://a.example" target="_blank" title="T">bare</a>\n</doc>'

const ALIASES_STATE = {
  root: {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [
          {
            type: 'text',
            text: 'a ',
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
          {
            type: 'text',
            text: 'b',
            format: 1,
            detail: 0,
            mode: 'normal',
            style: '',
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
            type: 'text',
            text: 'c',
            format: 2,
            detail: 0,
            mode: 'normal',
            style: '',
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
            type: 'text',
            text: 'd',
            format: 4,
            detail: 0,
            mode: 'normal',
            style: '',
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
            type: 'text',
            text: 'e',
            format: 4,
            detail: 0,
            mode: 'normal',
            style: '',
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
            type: 'text',
            text: 'f',
            format: 8,
            detail: 0,
            mode: 'normal',
            style: '',
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
            type: 'text',
            text: 'g',
            format: 32,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
          {
            type: 'text',
            text: 'h',
            format: 64,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
          {
            type: 'text',
            text: 'i',
            format: 128,
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
        type: 'horizontalrule',
        version: 1,
      },
      {
        type: 'heading',
        tag: 'h3',
        children: [
          {
            type: 'text',
            text: '  spaced  title ',
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
        type: 'list',
        listType: 'bullet',
        tag: 'ul',
        start: 1,
        children: [
          {
            type: 'listitem',
            children: [
              {
                type: 'text',
                text: 'x',
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
            value: 1,
          },
          {
            type: 'listitem',
            checked: false,
            children: [
              {
                type: 'text',
                text: 'y',
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
            value: 1,
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
      },
      {
        type: 'list',
        listType: 'number',
        tag: 'ol',
        start: 3,
        children: [
          {
            type: 'listitem',
            children: [
              {
                type: 'text',
                text: 'z',
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
            value: 1,
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
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
                text: 'q',
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
      {
        type: 'paragraph',
        children: [
          {
            type: 'text',
            text: 'line',
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
          {
            type: 'linebreak',
            version: 1,
          },
          {
            type: 'text',
            text: 'break',
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
        type: 'link',
        url: 'https://a.example',
        target: '_blank',
        title: 'T',
        rel: null,
        children: [
          {
            type: 'text',
            text: 'bare',
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
        version: 1,
      },
    ],
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  },
}

function defaultRegistry() {
  const registry = new LitexmlRegistry()
  registerBuiltinWriters(registry)
  registerBuiltinReaders(registry)
  return registry
}

describe('the basic nodes', () => {
  it('writes a whole document exactly', () => {
    expect(serializeToXml(SAMPLE_DOCUMENT, defaultRegistry())).toBe(SAMPLE_DOCUMENT_XML)
  })

  it('reads aliases, self-closing tags and layout whitespace', () => {
    expect(deserializeFromXml(ALIASES_XML, defaultRegistry())).toEqual(ALIASES_STATE)
  })

  it('writes one line with compact, and reads it back the same as the indented one', () => {
    const registry = defaultRegistry()
    const compact = serializeToXml(SAMPLE_DOCUMENT, registry, { compact: true })
    expect(compact).not.toContain('\n')
    expect(compact.startsWith('<doc><h2>')).toBe(true)
    expect(compact.endsWith('</doc>')).toBe(true)
    expect(deserializeFromXml(compact, registry)).toEqual(deserializeFromXml(SAMPLE_DOCUMENT_XML, registry))
  })

  it('keeps a node it has no writer for in <node>, and reads it back unchanged', () => {
    const registry = defaultRegistry()
    const unknown = {
      type: 'unknown-x',
      label: 'a "quoted" <label>',
      nested: {
        list: [1, 2],
      },
      version: 1,
    }
    const state = {
      root: {
        type: 'root',
        children: [unknown],
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
      },
    } as unknown as SerializedEditorState
    const xml = serializeToXml(state, registry)
    expect(xml).toContain('<node type="unknown-x" data="')
    expect((deserializeFromXml(xml, registry).root as any).children).toEqual([unknown])
  })
})
