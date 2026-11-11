import { describe, expect, it } from 'vitest'

import { computeDiff, decorateSubtree, DELETE_MARK_STYLE, diffModifiedNode, INSERT_MARK_STYLE } from '../src'

function makeDoc(children: any[]) {
  return {
    root: {
      type: 'root',
      children,
      direction: 'ltr' as const,
      format: '' as const,
      indent: 0,
      version: 1,
    },
  }
}

function makeParagraph(text: string) {
  return {
    type: 'paragraph',
    children: [
      {
        type: 'text',
        text,
        detail: 0,
        format: 0,
        mode: 'normal',
        style: '',
        version: 1,
      },
    ],
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
    textFormat: 0,
    textStyle: '',
  }
}

describe('computeDiff', () => {
  it('returns empty for identical documents', () => {
    const doc = makeDoc([
      makeParagraph('Hello'),
    ])
    const hunks = computeDiff(doc, doc)
    expect(hunks).toHaveLength(1)
    expect(hunks[0].type).toBe('equal')
  })

  it('detects an inserted node', () => {
    const old = makeDoc([
      makeParagraph('Hello'),
    ])
    const next = makeDoc([
      makeParagraph('Hello'),
      makeParagraph('World'),
    ])
    const hunks = computeDiff(old, next)
    const insertHunks = hunks.filter(h => h.type === 'insert')
    expect(insertHunks.length).toBeGreaterThan(0)
  })

  it('detects a deleted node', () => {
    const old = makeDoc([
      makeParagraph('Hello'),
      makeParagraph('World'),
    ])
    const next = makeDoc([
      makeParagraph('Hello'),
    ])
    const hunks = computeDiff(old, next)
    const deleteHunks = hunks.filter(h => h.type === 'delete')
    expect(deleteHunks.length).toBeGreaterThan(0)
  })

  it('detects a modified node as delete+insert pair', () => {
    const old = makeDoc([
      makeParagraph('Hello'),
    ])
    const next = makeDoc([
      makeParagraph('Hello World'),
    ])
    const hunks = computeDiff(old, next)
    expect(hunks.some(h => h.type === 'delete')).toBe(true)
    expect(hunks.some(h => h.type === 'insert')).toBe(true)
  })
})

describe('decorateSubtree', () => {
  it('adds delete mark style to text nodes', () => {
    const node = {
      type: 'text',
      text: 'Hello',
      style: '',
      detail: 0,
      format: 0,
      mode: 'normal',
      version: 1,
    } as any
    const decorated = decorateSubtree(node, 'delete') as any
    expect(decorated.style).toContain('line-through')
  })

  it('adds insert mark style to text nodes', () => {
    const node = {
      type: 'text',
      text: 'Hello',
      style: '',
      detail: 0,
      format: 0,
      mode: 'normal',
      version: 1,
    } as any
    const decorated = decorateSubtree(node, 'insert') as any
    expect(decorated.style).toContain('background-color')
    expect(decorated.style).not.toContain('line-through')
  })
})

describe('diffModifiedNode', () => {
  it('produces char-level diff for text changes', () => {
    const old = makeParagraph('Hello')
    const next = makeParagraph('Hello World')
    const result = diffModifiedNode(old as any, next as any)
    const oldText = (result.oldNode as any).children.map((c: any) => c.text).join('')
    const newText = (result.newNode as any).children.map((c: any) => c.text).join('')
    expect(oldText).toBe('Hello')
    expect(newText).toBe('Hello World')
  })
})

/*
 * Inputs and results worked out once and kept, with only
 * the mark colors changed to hakulex's (--hlx-color-alert-caution and --hlx-color-alert-tip).
 */
const CASES = {
  four: [
    {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: '甲',
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
            textFormat: 0,
            textStyle: '',
          },
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: 'Hello world',
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
            textFormat: 0,
            textStyle: '',
          },
          {
            type: 'heading',
            tag: 'h3',
            children: [
              {
                type: 'text',
                text: '丙',
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
            textFormat: 0,
            textStyle: '',
          },
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: '丁',
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
            textFormat: 0,
            textStyle: '',
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
                text: '甲',
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
            textFormat: 0,
            textStyle: '',
          },
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: 'Hello there world',
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
            textFormat: 0,
            textStyle: '',
          },
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: '丁',
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
            textFormat: 0,
            textStyle: '',
          },
          {
            type: 'quote',
            children: [
              {
                type: 'text',
                text: '戊',
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
    },
  ],
  tie: [
    {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: '甲',
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
            textFormat: 0,
            textStyle: '',
          },
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: '丙',
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
            textFormat: 0,
            textStyle: '',
          },
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: '丁',
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
            textFormat: 0,
            textStyle: '',
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
                text: '甲',
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
            textFormat: 0,
            textStyle: '',
          },
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: '丁',
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
            textFormat: 0,
            textStyle: '',
          },
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: '戊',
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
            textFormat: 0,
            textStyle: '',
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
      },
    },
  ],
  long: [
    {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: 'xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaay',
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
            textFormat: 0,
            textStyle: '',
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
                text: 'xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbby',
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
            textFormat: 0,
            textStyle: '',
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
      },
    },
  ],
  bold: [
    {
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
                text: 'bold',
                format: 1,
                detail: 0,
                mode: 'normal',
                style: '',
                version: 1,
              },
              {
                type: 'text',
                text: ' b',
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
            textFormat: 0,
            textStyle: '',
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
                text: 'a ',
                format: 0,
                detail: 0,
                mode: 'normal',
                style: '',
                version: 1,
              },
              {
                type: 'text',
                text: 'bolder',
                format: 1,
                detail: 0,
                mode: 'normal',
                style: '',
                version: 1,
              },
              {
                type: 'text',
                text: ' b',
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
            textFormat: 0,
            textStyle: '',
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
      },
    },
  ],
  kinds: [
    {
      root: {
        type: 'root',
        children: [
          {
            type: 'image',
            src: 'a.png',
            altText: '',
            version: 1,
          },
          {
            type: 'image',
            src: 'b.png',
            altText: '',
            version: 1,
          },
          {
            type: 'heading',
            tag: 'h2',
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
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            textFormat: 0,
            textStyle: '',
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
                text: '段落',
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
            textFormat: 0,
            textStyle: '',
          },
          {
            type: 'image',
            src: 'c.png',
            altText: '',
            version: 1,
          },
          {
            type: 'heading',
            tag: 'h3',
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
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            textFormat: 0,
            textStyle: '',
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
      },
    },
  ],
} as Record<string, [any, any]>

const EXPECTED = {
  four: [
    {
      type: 'equal',
      nodes: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: '甲',
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
          textFormat: 0,
          textStyle: '',
        },
      ],
    },
    {
      type: 'delete',
      nodes: [
        {
          type: 'paragraph',
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
          textFormat: 0,
          textStyle: '',
        },
      ],
    },
    {
      type: 'insert',
      nodes: [
        {
          type: 'paragraph',
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
              text: 'there ',
              format: 0,
              detail: 0,
              mode: 'normal',
              style: 'background-color: color-mix(in srgb, var(--hlx-color-alert-tip) 22%, transparent);',
              version: 1,
            },
            {
              type: 'text',
              text: 'world',
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
          textFormat: 0,
          textStyle: '',
        },
      ],
    },
    {
      type: 'delete',
      nodes: [
        {
          type: 'heading',
          tag: 'h3',
          children: [
            {
              type: 'text',
              text: '丙',
              format: 0,
              detail: 0,
              mode: 'normal',
              style: 'background-color: color-mix(in srgb, var(--hlx-color-alert-caution) 22%, transparent); text-decoration: line-through;',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
          textFormat: 0,
          textStyle: '',
        },
      ],
    },
    {
      type: 'equal',
      nodes: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: '丁',
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
          textFormat: 0,
          textStyle: '',
        },
      ],
    },
    {
      type: 'insert',
      nodes: [
        {
          type: 'quote',
          children: [
            {
              type: 'text',
              text: '戊',
              format: 0,
              detail: 0,
              mode: 'normal',
              style: 'background-color: color-mix(in srgb, var(--hlx-color-alert-tip) 22%, transparent);',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
        },
      ],
    },
  ],
  tie: [
    {
      type: 'equal',
      nodes: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: '甲',
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
          textFormat: 0,
          textStyle: '',
        },
      ],
    },
    {
      type: 'delete',
      nodes: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: '丙',
              format: 0,
              detail: 0,
              mode: 'normal',
              style: 'background-color: color-mix(in srgb, var(--hlx-color-alert-caution) 22%, transparent); text-decoration: line-through;',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
          textFormat: 0,
          textStyle: '',
        },
      ],
    },
    {
      type: 'insert',
      nodes: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: '丁',
              format: 0,
              detail: 0,
              mode: 'normal',
              style: 'background-color: color-mix(in srgb, var(--hlx-color-alert-tip) 22%, transparent);',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
          textFormat: 0,
          textStyle: '',
        },
      ],
    },
    {
      type: 'delete',
      nodes: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: '丁',
              format: 0,
              detail: 0,
              mode: 'normal',
              style: 'background-color: color-mix(in srgb, var(--hlx-color-alert-caution) 22%, transparent); text-decoration: line-through;',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
          textFormat: 0,
          textStyle: '',
        },
      ],
    },
    {
      type: 'insert',
      nodes: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: '戊',
              format: 0,
              detail: 0,
              mode: 'normal',
              style: 'background-color: color-mix(in srgb, var(--hlx-color-alert-tip) 22%, transparent);',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
          textFormat: 0,
          textStyle: '',
        },
      ],
    },
  ],
  long: [
    {
      type: 'delete',
      nodes: [
        {
          type: 'paragraph',
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
            {
              type: 'text',
              text: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              format: 0,
              detail: 0,
              mode: 'normal',
              style: 'background-color: color-mix(in srgb, var(--hlx-color-alert-caution) 22%, transparent); text-decoration: line-through;',
              version: 1,
            },
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
          version: 1,
          textFormat: 0,
          textStyle: '',
        },
      ],
    },
    {
      type: 'insert',
      nodes: [
        {
          type: 'paragraph',
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
            {
              type: 'text',
              text: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
              format: 0,
              detail: 0,
              mode: 'normal',
              style: 'background-color: color-mix(in srgb, var(--hlx-color-alert-tip) 22%, transparent);',
              version: 1,
            },
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
          version: 1,
          textFormat: 0,
          textStyle: '',
        },
      ],
    },
  ],
  bold: [
    {
      type: 'delete',
      nodes: [
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
              text: 'bold',
              format: 1,
              detail: 0,
              mode: 'normal',
              style: '',
              version: 1,
            },
            {
              type: 'text',
              text: ' b',
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
          textFormat: 0,
          textStyle: '',
        },
      ],
    },
    {
      type: 'insert',
      nodes: [
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
              text: 'bold',
              format: 1,
              detail: 0,
              mode: 'normal',
              style: '',
              version: 1,
            },
            {
              type: 'text',
              text: 'er',
              format: 1,
              detail: 0,
              mode: 'normal',
              style: 'background-color: color-mix(in srgb, var(--hlx-color-alert-tip) 22%, transparent);',
              version: 1,
            },
            {
              type: 'text',
              text: ' b',
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
          textFormat: 0,
          textStyle: '',
        },
      ],
    },
  ],
  kinds: [
    {
      type: 'insert',
      nodes: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: '段落',
              format: 0,
              detail: 0,
              mode: 'normal',
              style: 'background-color: color-mix(in srgb, var(--hlx-color-alert-tip) 22%, transparent);',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
          textFormat: 0,
          textStyle: '',
        },
      ],
    },
    {
      type: 'delete',
      nodes: [
        {
          type: 'image',
          src: 'a.png',
          altText: '',
          version: 1,
        },
      ],
    },
    {
      type: 'insert',
      nodes: [
        {
          type: 'image',
          src: 'c.png',
          altText: '',
          version: 1,
        },
      ],
    },
    {
      type: 'insert',
      nodes: [
        {
          type: 'heading',
          tag: 'h3',
          children: [
            {
              type: 'text',
              text: '標題',
              format: 0,
              detail: 0,
              mode: 'normal',
              style: 'background-color: color-mix(in srgb, var(--hlx-color-alert-tip) 22%, transparent);',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
          textFormat: 0,
          textStyle: '',
        },
      ],
    },
    {
      type: 'delete',
      nodes: [
        {
          type: 'image',
          src: 'b.png',
          altText: '',
          version: 1,
        },
      ],
    },
    {
      type: 'delete',
      nodes: [
        {
          type: 'heading',
          tag: 'h2',
          children: [
            {
              type: 'text',
              text: '標題',
              format: 0,
              detail: 0,
              mode: 'normal',
              style: 'background-color: color-mix(in srgb, var(--hlx-color-alert-caution) 22%, transparent); text-decoration: line-through;',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
          textFormat: 0,
          textStyle: '',
        },
      ],
    },
  ],
} as Record<string, unknown>

describe('computeDiff, worked examples', () => {
  it('four: diff', () => {
    const [before, after] = CASES.four
    expect(computeDiff(before, after)).toEqual(EXPECTED.four)
  })

  it('tie: diff', () => {
    const [before, after] = CASES.tie
    expect(computeDiff(before, after)).toEqual(EXPECTED.tie)
  })

  it('long: diff', () => {
    const [before, after] = CASES.long
    expect(computeDiff(before, after)).toEqual(EXPECTED.long)
  })

  it('bold: diff', () => {
    const [before, after] = CASES.bold
    expect(computeDiff(before, after)).toEqual(EXPECTED.bold)
  })

  it('kinds: diff', () => {
    const [before, after] = CASES.kinds
    expect(computeDiff(before, after)).toEqual(EXPECTED.kinds)
  })

  it('marks with hakulex\'s colors', () => {
    expect(DELETE_MARK_STYLE).toContain('--hlx-color-alert-caution')
    expect(DELETE_MARK_STYLE).toContain('line-through')
    expect(INSERT_MARK_STYLE).toContain('--hlx-color-alert-tip')
  })

  it('compares hundreds of blocks in reasonable time', () => {
    const blocks = (prefix: string) => Array.from({ length: 400 }, (_, i) => makeParagraph(i % 37 === 0
      ? `${prefix} ${i}`
      : `段落 ${i} 的內容`))
    const started = performance.now()
    const hunks = computeDiff(makeDoc(blocks('舊')), makeDoc(blocks('新')))
    expect(performance.now() - started).toBeLessThan(3000)
    expect(hunks.filter(hunk => hunk.type === 'delete')).toHaveLength(11)
    expect(hunks.filter(hunk => hunk.type === 'insert')).toHaveLength(11)
  })
})
