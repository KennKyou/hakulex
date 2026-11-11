import type { SerializedNode } from '../src'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { normalizeChat, renderChatMarkdown, RichRenderer } from '../src'

const user = { id: 'u', kind: 'user', name: '小明' }
const agent = { id: 'a', kind: 'agent' }
const other = { id: 'o', kind: 'user', name: '小華' }
const message = (participantId: unknown, content: unknown, id: unknown = 'm') => ({ id, participantId, content })
function chat(variant: unknown, participants: unknown, messages: unknown): SerializedNode {
  return {
    type: 'chat',
    version: 1,
    variant,
    participants,
    messages,
  }
}

async function ssr(node: SerializedNode) {
  const value = {
    root: {
      type: 'root',
      children: [node],
    },
  }
  const html = await renderToString(createSSRApp({
    render: () => h(RichRenderer, { value }),
  }))
  const container = document.createElement('div')
  container.innerHTML = html
  return container
}

function markdown(content: string) {
  const container = document.createElement('div')
  container.innerHTML = renderChatMarkdown(content)
  return container
}

describe('reading stored data', () => {
  it('uses user-agent for what it doesn\'t know', () => {
    expect(normalizeChat({ variant: 'x' }).variant).toBe('user-agent')
    expect(normalizeChat({ variant: 'user-user' }).variant).toBe('user-user')
  })

  it.each([undefined, 'a', 7, {}, null])('takes %s as lists', (value) => {
    const { participants, messages } = normalizeChat({ participants: value, messages: value })
    expect(participants).toEqual([])
    expect(messages).toEqual([])
  })

  it('leaves out what isn\'t valid', () => {
    const { participants, messages } = normalizeChat({
      participants: [
        1,
        null,
        { kind: 'user' },
        { id: 7 },
        user,
      ],
      messages: [
        1,
        null,
        { participantId: 'u' },
        { content: 'x' },
        message(1, 'x'),
        message('u', 7),
        message('u', '字'),
      ],
    })
    expect(participants.map((item: { id: string }) => item.id)).toEqual(['u'])
    expect(messages.map((item: { content: string }) => item.content)).toEqual(['字'])
  })

  it('takes only what is safe from a participant', () => {
    const [item] = normalizeChat({
      participants: [
        {
          id: 'x',
          kind: 'robot',
          name: 7,
          avatar: 'javascript:alert(1)',
        },
      ],
    }).participants
    expect(item).toEqual({
      id: 'x',
      kind: 'user',
      name: undefined,
      avatar: undefined,
    })
  })
})

describe('user and agent', () => {
  it('puts the user on the right in a bubble, and names the agent on the left', async () => {
    const html = await ssr(chat('user-agent', [
      user,
      { ...agent, name: 'Claude' },
    ], [
      message('u', '問', '1'),
      message('a', '答', '2'),
    ]))
    const rows = [
      ...html.querySelectorAll<HTMLElement>('.hlx-chat-row'),
    ]
    expect(rows.map(row => row.dataset.side)).toEqual(['right', 'left'])
    expect(rows[0].querySelector('.hlx-chat-bubble')!.textContent).toContain('問')
    expect(rows[1].querySelector('.hlx-chat-bubble')).toBeNull()
    expect(rows[1].querySelector('.hlx-chat-article')!.textContent).toContain('答')
    expect(rows[1].querySelector('.hlx-chat-author')!.textContent).toBe('Claude')
  })

  it('has default names', async () => {
    const html = await ssr(chat('user-user', [
      { id: 'u', kind: 'user' },
      agent,
    ], [
      message('u', 'x', '1'),
      message('a', 'y', '2'),
    ]))
    expect([
      ...html.querySelectorAll('.hlx-chat-author'),
    ].map(item => item.textContent)).toEqual(['使用者', '助理'])
  })
})

describe('user and user', () => {
  it('puts the second person on the right, and names everyone', async () => {
    const html = await ssr(chat('user-user', [user, other], [
      message('u', '甲', '1'),
      message('o', '乙', '2'),
    ]))
    const rows = [
      ...html.querySelectorAll<HTMLElement>('.hlx-chat-row'),
    ]
    expect(rows.map(row => row.dataset.side)).toEqual(['left', 'right'])
    expect(rows.map(row => row.querySelector('.hlx-chat-author')!.textContent)).toEqual(['小明', '小華'])
    expect(rows.every(row => row.querySelector('.hlx-chat-bubble') && row.querySelector('.hlx-chat-avatar'))).toBe(true)
  })
})

describe('markdown', () => {
  it('formats text, lists, tables, links and code', () => {
    const html = markdown('**粗** *斜* ~~刪~~\n\n- 一\n- 二\n\n| a |\n| --- |\n| b |\n\n[連結](https://example.com)\n\n```ts\nconst a = "<b>"\n```')
    expect(html.querySelector('strong')!.textContent).toBe('粗')
    expect(html.querySelector('em')!.textContent).toBe('斜')
    expect(html.querySelector('s')!.textContent).toBe('刪')
    expect(html.querySelectorAll('li')).toHaveLength(2)
    expect(html.querySelector('td')!.textContent).toBe('b')
    const link = html.querySelector('a')!
    expect(link.getAttribute('href')).toBe('https://example.com')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(html.querySelector('pre code')!.textContent).toContain('const a = "<b>"')
    expect(html.querySelector('b')).toBeNull()
  })

  it('takes a safe image, lazily', () => {
    const img = markdown('![圖](https://example.com/a.png)').querySelector('img')!
    expect(img.getAttribute('src')).toBe('https://example.com/a.png')
    expect(img.getAttribute('loading')).toBe('lazy')
  })

  it.each([
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)>',
    '<a href="javascript:alert(1)">x</a>',
    '<iframe src="https://evil.com"></iframe>',
    '<style>body{display:none}</style>',
    '<b unclosed',
    '```\n</code></pre><script>alert(1)</script>\n```',
    '`<script>alert(1)</script>`',
    '![x" onerror="alert(1)](https://example.com/a.png)',
    '[x](https://example.com "\\" onclick=\\"alert(1)")',
  ])('makes %s harmless', (source) => {
    const html = markdown(source)
    expect(html.querySelector('script, iframe, style, svg, b')).toBeNull()
    for (const element of html.querySelectorAll('*')) {
      for (const attribute of element.attributes)
        expect(attribute.name).not.toMatch(/^on/i)
    }
    expect(html.querySelector('[href^="javascript"]')).toBeNull()
  })

  it.each([
    '[x](javascript:alert(1))',
    '[x](JaVaScRiPt:alert(1))',
    '[x](&#106;avascript:alert(1))',
    '[x](vbscript:alert(1))',
    '[x](data:text/html,<script>alert(1)</script>)',
    '[x](data:image/png;base64,AAAA)',
    '[x](//evil.com)',
    '<javascript:alert(1)>',
  ])('makes no link out of %s', (source) => {
    expect(markdown(source).querySelector('a')).toBeNull()
  })

  it.each([
    '![x](javascript:alert(1))',
    '![x](data:image/svg+xml,<svg onload=alert(1)>)',
    '![x](data:text/html,x)',
    '![x](//evil.com/a.png)',
  ])('makes no image out of %s', (source) => {
    expect(markdown(source).querySelector('img')).toBeNull()
  })

  it('keeps line breaks in a message', () => {
    expect(markdown('一\n二').querySelector('br')).not.toBeNull()
  })

  it.each([undefined, null, 7, {}])('has nothing to show for %s', (content) => {
    expect(renderChatMarkdown(content)).toBe('')
  })
})

describe('server output', () => {
  it('escapes names, and shows HTML in a message as text', async () => {
    const html = await ssr(chat('user-user', [
      { ...user, name: '<img src=x onerror=alert(1)>' },
      other,
    ], [
      message('u', '<script>alert(1)</script>'),
    ]))
    expect(html.querySelector('script, img')).toBeNull()
    expect(html.querySelector('.hlx-chat-author')!.textContent).toBe('<img src=x onerror=alert(1)>')
    expect(html.querySelector('.hlx-chat-bubble')!.textContent).toContain('<script>alert(1)</script>')
  })

  it('shows an avatar when it is safe, or else the first letter', async () => {
    const html = await ssr(chat('user-user', [
      {
        id: 'u',
        kind: 'user',
        name: 'amy',
        avatar: 'https://example.com/a.png',
      },
      {
        id: 'o',
        kind: 'user',
        name: '小華',
        avatar: 'javascript:alert(1)',
      },
    ], [
      message('u', 'x', '1'),
      message('o', 'y', '2'),
    ]))
    const avatars = [
      ...html.querySelectorAll('.hlx-chat-avatar'),
    ]
    expect(avatars[0].querySelector('img')!.getAttribute('src')).toBe('https://example.com/a.png')
    expect(avatars[0].querySelector('img')!.getAttribute('alt')).toBe('')
    expect(avatars[1].querySelector('img')).toBeNull()
    expect(avatars[1].textContent).toBe('小')
    const first = await ssr(chat('user-user', [
      { id: 'u', kind: 'user', name: 'amy' },
    ], [
      message('u', 'x'),
    ]))
    expect(first.querySelector('.hlx-chat-avatar')!.textContent).toBe('A')
  })

  it('names a participant that doesn\'t exist', async () => {
    const html = await ssr(chat('user-user', [user], [
      message('nobody', 'x'),
    ]))
    expect(html.querySelector('.hlx-chat-author')!.textContent).toBe('未知')
  })

  it.each([
    [[]],
    [undefined],
    [
      [1],
    ],
  ])('outputs nothing with no messages: %o', async (messages) => {
    expect((await ssr(chat('user-agent', [user], messages))).querySelector('.hlx-chat')).toBeNull()
  })
})
