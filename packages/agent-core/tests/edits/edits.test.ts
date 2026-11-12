import type { AgentDocument, Block, Proposal, ReviewItem } from '../../src/edits'
import { allHeadlessNodes } from '@hakulex/headless'
import { createHeadlessEditor } from '@lexical/headless'
import { describe, expect, it } from 'vitest'
import {
  acceptAll,
  acceptItem,
  agentTools,
  applyToolCall,
  createProposal,
  documentToXml,
  ensureBlockIds,
  rejectAll,
  rejectItem,
  reviewItems,
  settleProposal,
  takeRejected,
} from '../../src/edits'

type Json = Record<string, any>

const ID = /^[\w-]{8}$/

function text(value: string): Json {
  return {
    type: 'text',
    text: value,
    format: 0,
    detail: 0,
    mode: 'normal',
    style: '',
    version: 1,
  }
}
function element(type: string, value: string, id?: string, more: Json = {}): Block {
  return {
    type,
    children: value
      ? [
          text(value),
        ]
      : [],
    direction: null,
    format: '',
    indent: 0,
    version: 1,
    ...more,
    ...(id === undefined
      ? {}
      : {
          $: { blockId: id },
        }),
  } as unknown as Block
}
const p = (id: string | undefined, value: string) => element('paragraph', value, id, { textFormat: 0, textStyle: '' })
function doc(...children: Block[]): AgentDocument {
  return {
    root: {
      type: 'root',
      children,
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  } as unknown as AgentDocument
}

const blocksOf = (document: AgentDocument) => (document.root as Json).children as Json[]
const idsOf = (document: AgentDocument) => blocksOf(document).map(block => block.$?.blockId as string | undefined)
const textOf = (node: Json): string => node.text ?? (node.children ?? []).map(textOf).join('')
const textsOf = (document: AgentDocument) => blocksOf(document).map(textOf)

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))

/** Four paragraphs: a1 一, b2 二, c3 三, d4 四. */
const four = () => doc(p('a1', '一'), p('b2', '二'), p('c3', '三'), p('d4', '四'))

function call(document: AgentDocument, proposal: Proposal, name: string, input: unknown, turn = 1) {
  return applyToolCall(document, proposal, { name, input }, { turn })
}
/** Runs calls one after another, each of which has to succeed. */
function propose(document: AgentDocument, calls: [string, unknown][], from = createProposal(), turn = 1) {
  let proposal = from
  for (const [name, input] of calls) {
    const result = call(document, proposal, name, input, turn)
    expect(result.ok, result.content).toBe(true)
    proposal = result.proposal
  }
  return proposal
}
const states = (items: ReviewItem[]) => items.map(item => `${item.kind}:${item.state}`)
function withBlock(document: AgentDocument, id: string, change: (block: Json) => Json | null) {
  const next = copy(document)
  ;(next.root as Json).children = blocksOf(next).flatMap((block) => {
    if (block.$?.blockId !== id)
      return [block]
    const changed = change(block)
    return changed
      ? [changed]
      : []
  })
  return next
}
function edited(document: AgentDocument, id: string, value: string) {
  return withBlock(document, id, block => ({
    ...block,
    children: [
      text(value),
    ],
  }))
}
const without = (document: AgentDocument, id: string) => withBlock(document, id, () => null)

describe('ensureBlockIds', () => {
  it('gives every top-level block an ID of its own and touches nothing else', () => {
    const nested = {
      type: 'nested-doc',
      version: 1,
      content: doc(p(undefined, '裡面')),
      $: { blockId: 'nest0001' },
    } as unknown as Block
    const given = freeze(doc(p('keep0001', '一'), p(undefined, '二'), p('same0001', '三'), nested, p('same0001', '五'), p('', '六')))
    const out = ensureBlockIds(given)

    const ids = idsOf(out)
    expect(ids[0]).toBe('keep0001')
    expect(ids[2]).toBe('same0001')
    expect(ids[3]).toBe('nest0001')
    for (const id of [ids[1], ids[4], ids[5]])
      expect(id).toMatch(ID)
    expect(new Set(ids).size).toBe(ids.length)
    expect(textsOf(out)).toEqual(textsOf(given))
    expect(JSON.stringify(blocksOf(out)[3].content)).not.toContain('blockId')
    expect(out).not.toBe(given)
  })

  it('hands back the same object when nothing is missing', () => {
    const once = ensureBlockIds(doc(p(undefined, '一'), p(undefined, '二')))
    for (const id of idsOf(once))
      expect(id).toMatch(ID)
    expect(ensureBlockIds(once)).toBe(once)
  })
})

describe('documentToXml', () => {
  it('writes each block with its ID', () => {
    const xml = documentToXml(four())
    expect(xml).toMatch(/^<doc>/)
    for (const id of ['a1', 'b2', 'c3', 'd4'])
      expect(xml).toContain(`<p id="${id}">`)
  })

  it('with a proposal, shows the document as it would become', () => {
    const document = four()
    const proposal = propose(document, [
      [
        'replace_block',
        { blockId: 'b2', xml: '<h2>新的二</h2>' },
      ],
      [
        'delete_block',
        { blockId: 'c3' },
      ],
      [
        'insert_blocks',
        { position: 'after', blockId: 'a1', xml: '<p>甲</p><p>乙</p>' },
      ],
    ])
    const xml = documentToXml(document, { proposal })
    const added = proposal.changes.flatMap(change => change.kind === 'insert'
      ? change.blocks.map(block => block.id)
      : [])
    expect(added).toHaveLength(2)

    expect(xml).toContain('<h2 id="b2">新的二</h2>')
    expect(xml).not.toContain('三')
    expect(xml).toContain(`<p id="${added[0]}">甲</p>`)
    expect(xml).toContain(`<p id="${added[1]}">乙</p>`)
    const order = ['一', '甲', '乙', '新的二', '四'].map(value => xml.indexOf(value))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(order.every(index => index >= 0)).toBe(true)
    // Without the proposal it is still the document as it is.
    expect(documentToXml(document)).toContain('<p id="c3">三</p>')
  })

  it('marks the selected blocks, or says which text is selected and where', () => {
    const marked = documentToXml(four(), {
      selection: {
        blockIds: ['b2', 'c3'],
      },
    })
    expect(marked).toMatch(/<p id="b2"[^>]*selected="true"/)
    expect(marked).toMatch(/<p id="c3"[^>]*selected="true"/)
    expect(marked).not.toMatch(/<p id="a1"[^>]*selected/)

    const quoted = documentToXml(four(), {
      selection: { blockId: 'b2', text: '1 < 2 & 3' },
    })
    expect(quoted).toContain('1 &lt; 2 &amp; 3')
    expect(quoted).toMatch(/<selection[^>]*block="b2"/)
    expect(quoted).not.toContain('selected="true"')
  })

  it('shows a block of a kind LiteXML does not know as an empty marker', () => {
    const unknown = {
      type: 'mystery-block',
      version: 1,
      secret: 'do-not-show',
      $: { blockId: 'm1' },
    } as unknown as Block
    const xml = documentToXml(doc(p('a1', '一'), unknown))
    expect(xml).toMatch(/<node type="mystery-block" id="m1"\s*\/>/)
    expect(xml).not.toContain('do-not-show')
    expect(xml).not.toContain('data=')
  })

  it('shows what the user has when the block the proposal would change was edited', () => {
    const document = four()
    const proposal = propose(document, [
      [
        'replace_block',
        { blockId: 'b2', xml: '<p>AI 的版本</p>' },
      ],
    ])
    const xml = documentToXml(edited(document, 'b2', '使用者的版本'), { proposal })
    expect(xml).toContain('使用者的版本')
    expect(xml).not.toContain('AI 的版本')
  })
})

describe('the tools', () => {
  it('are three, described without anything a particular provider needs', () => {
    expect(agentTools.map(tool => tool.name)).toEqual(['insert_blocks', 'replace_block', 'delete_block'])
    for (const tool of agentTools) {
      expect(Object.keys(tool).sort()).toEqual(['description', 'name', 'parameters'])
      expect(tool.description.length).toBeGreaterThan(20)
      expect(tool.parameters).toMatchObject({ type: 'object' })
      expect((tool.parameters as Json).required.length).toBeGreaterThan(0)
    }
  })

  it('insert_blocks stages new blocks where asked, in order, each with a new ID', () => {
    const document = freeze(four())
    const empty = freeze(createProposal())
    const places: [unknown, string[]][] = [
      [
        { position: 'after', blockId: 'b2' },
        ['一', '二', '甲', '乙', '三', '四'],
      ],
      [
        { position: 'before', blockId: 'b2' },
        ['一', '甲', '乙', '二', '三', '四'],
      ],
      [
        { position: 'start' },
        ['甲', '乙', '一', '二', '三', '四'],
      ],
      [
        { position: 'end' },
        ['一', '二', '三', '四', '甲', '乙'],
      ],
    ]
    for (const [where, expected] of places) {
      const result = call(document, empty, 'insert_blocks', { ...where as object, xml: '<p>甲</p><p>乙</p>' })
      expect(result.ok, result.content).toBe(true)
      expect(result.proposal).not.toBe(empty)
      const insert = result.proposal.changes.find(change => change.kind === 'insert')!
      expect(insert.kind === 'insert' && insert.blocks.map(block => textOf(block.node))).toEqual(['甲', '乙'])
      const ids = insert.kind === 'insert'
        ? insert.blocks.map(block => block.id)
        : []
      for (const id of ids) {
        expect(id).toMatch(ID)
        expect(result.content).toContain(id)
      }
      expect(new Set(ids).size).toBe(2)
      expect(result.content.toLowerCase()).toContain('review')
      expect(textsOf(acceptAll(document, result.proposal).document)).toEqual(expected)
    }
    // Neither the document nor the proposal passed in was written to (they are frozen).
    expect(textsOf(document)).toEqual(['一', '二', '三', '四'])
    expect(empty.changes).toEqual([])
  })

  it('replace_block keeps one change per block, with the block as it was and its ID', () => {
    const document = four()
    const first = propose(document, [
      [
        'replace_block',
        { blockId: 'b2', xml: '<p id="zz">第一次</p>' },
      ],
    ])
    expect(first.changes).toHaveLength(1)
    const change = first.changes[0]
    expect(change).toMatchObject({ kind: 'replace', id: 'b2', turn: 1 })
    expect(change.kind === 'replace' && change.base).toEqual(blocksOf(document)[1])
    expect(change.kind === 'replace' && (change.node as Json).$.blockId).toBe('b2')
    expect(change.kind === 'replace' && textOf(change.node)).toBe('第一次')

    const second = propose(document, [
      [
        'replace_block',
        { blockId: 'b2', xml: '<h2>第二次</h2>' },
      ],
    ], first, 2)
    expect(second.changes).toHaveLength(1)
    expect(second.changes[0]).toMatchObject({ kind: 'replace', id: 'b2', turn: 2 })
    expect(second.changes[0].kind === 'replace' && textOf(second.changes[0].node)).toBe('第二次')

    const back = propose(document, [
      [
        'replace_block',
        { blockId: 'b2', xml: '<p>二</p>' },
      ],
    ], second)
    expect(back.changes).toEqual([])
  })

  it('replace_block with more than one block puts the rest right after', () => {
    const document = four()
    const proposal = propose(document, [
      [
        'replace_block',
        { blockId: 'b2', xml: '<p>新二</p><p>多的</p>' },
      ],
    ])
    expect(proposal.changes.map(change => change.kind).sort()).toEqual(['insert', 'replace'])
    expect(textsOf(acceptAll(document, proposal).document)).toEqual(['一', '新二', '多的', '三', '四'])
  })

  it('delete_block stages a deletion, and undoes a staged insertion instead of deleting it', () => {
    const document = four()
    const withInsert = propose(document, [
      [
        'insert_blocks',
        { position: 'end', xml: '<p>新增</p>' },
      ],
    ])
    const added = withInsert.changes[0].kind === 'insert'
      ? withInsert.changes[0].blocks[0].id
      : ''

    const deleted = propose(document, [
      [
        'delete_block',
        { blockId: 'c3' },
      ],
    ], withInsert)
    const deletion = deleted.changes.find(change => change.kind === 'delete')!
    expect(deletion).toMatchObject({ kind: 'delete', id: 'c3' })
    expect(deletion.kind === 'delete' && deletion.base).toEqual(blocksOf(document)[2])

    const gone = propose(document, [
      [
        'delete_block',
        { blockId: added },
      ],
    ], deleted)
    expect(gone.changes.map(change => change.kind)).toEqual(['delete'])

    const rewritten = propose(document, [
      [
        'replace_block',
        { blockId: added, xml: '<p>改過的新增</p>' },
      ],
    ], withInsert)
    expect(rewritten.changes).toHaveLength(1)
    expect(rewritten.changes[0].kind === 'insert' && rewritten.changes[0].blocks.map(block => [
      block.id,
      textOf(block.node),
    ])).toEqual([
      [added, '改過的新增'],
    ])
  })

  it('replace_block on a block in conflict proposes again from what the user has', () => {
    const document = four()
    const proposal = propose(document, [
      [
        'replace_block',
        { blockId: 'b2', xml: '<p>AI 第一版</p>' },
      ],
    ])
    const changed = edited(document, 'b2', '使用者改的')
    expect(states(reviewItems(changed, proposal))).toEqual(['replace:conflict'])

    const again = propose(changed, [
      [
        'replace_block',
        { blockId: 'b2', xml: '<p>AI 第二版</p>' },
      ],
    ], proposal, 2)
    const items = reviewItems(changed, again)
    expect(states(items)).toEqual(['replace:pending'])
    expect(items[0].before.map(textOf)).toEqual(['使用者改的'])
    expect(items[0].after.map(textOf)).toEqual(['AI 第二版'])
  })

  it('turns down what it cannot do, says why, and changes nothing', () => {
    const document = freeze(four())
    const proposal = freeze(propose(four(), [
      [
        'replace_block',
        { blockId: 'a1', xml: '<p>已經有一筆</p>' },
      ],
    ]))
    const failing: [string, unknown, RegExp][] = [
      [
        'replace_block',
        { blockId: 'nope', xml: '<p>x</p>' },
        /nope/,
      ],
      [
        'delete_block',
        { blockId: 'nope' },
        /nope/,
      ],
      [
        'insert_blocks',
        { position: 'after', blockId: 'nope', xml: '<p>x</p>' },
        /nope/,
      ],
      [
        'replace_block',
        { blockId: 'b2', xml: '<p>沒有關<b>粗體</p>' },
        /<b>/,
      ],
      [
        'replace_block',
        { blockId: 'b2', xml: '<p>1 < 2</p>' },
        /&lt;/,
      ],
      [
        'insert_blocks',
        { position: 'end', xml: '<section><p>x</p></section>' },
        /section/,
      ],
      [
        'insert_blocks',
        { position: 'end', xml: '   ' },
        /empty|nothing/i,
      ],
      [
        'insert_blocks',
        { position: 'end', xml: '<node type="mystery-block" data="{}" />' },
        /node/,
      ],
      [
        'insert_blocks',
        { position: 'end', xml: '只有文字' },
        /block/i,
      ],
      [
        'insert_blocks',
        { position: 'sideways', xml: '<p>x</p>' },
        /position/,
      ],
      [
        'insert_blocks',
        { position: 'after', xml: '<p>x</p>' },
        /blockId/,
      ],
      [
        'replace_block',
        { xml: '<p>x</p>' },
        /blockId/,
      ],
      [
        'replace_block',
        { blockId: 'b2' },
        /xml/,
      ],
      [
        'search_document',
        { query: 'x' },
        /search_document/,
      ],
      ['replace_block', '{ not json', /JSON/],
    ]
    for (const [name, input, why] of failing) {
      const result = applyToolCall(document, proposal, { name, input })
      expect(result.ok, `${name} ${JSON.stringify(input)}`).toBe(false)
      expect(result.content).toMatch(why)
      expect(result.proposal).toBe(proposal)
    }
  })

  it('takes the arguments as JSON text too', () => {
    const result = applyToolCall(four(), createProposal(), { name: 'delete_block', input: '{"blockId":"c3"}' })
    expect(result.ok).toBe(true)
    expect(result.proposal.changes).toMatchObject([
      { kind: 'delete', id: 'c3' },
    ])
  })

  it('turns down a change to a block the user edited after the model saw it, with what is there now', () => {
    const seen = four()
    const now = edited(seen, 'b2', '剛剛改的')
    const proposal = createProposal()
    for (const [name, input] of [
      [
        'replace_block',
        { blockId: 'b2', xml: '<p>AI</p>' },
      ],
      [
        'delete_block',
        { blockId: 'b2' },
      ],
    ] as const) {
      const result = applyToolCall(now, proposal, { name, input }, { seen })
      expect(result.ok).toBe(false)
      expect(result.content).toContain('<p id="b2">剛剛改的</p>')
      expect(result.proposal).toBe(proposal)
    }
    // A block the user didn't touch is fine, and so is everything when `seen` isn't given.
    expect(applyToolCall(now, proposal, {
      name: 'delete_block',
      input: { blockId: 'c3' },
    }, { seen }).ok).toBe(true)
    expect(applyToolCall(now, proposal, {
      name: 'delete_block',
      input: { blockId: 'b2' },
    }).ok).toBe(true)
  })
})

describe('reviewItems', () => {
  const calls: [string, unknown][] = [
    [
      'replace_block',
      { blockId: 'b2', xml: '<p>新二</p>' },
    ],
    [
      'delete_block',
      { blockId: 'c3' },
    ],
    [
      'insert_blocks',
      { position: 'after', blockId: 'a1', xml: '<p>甲</p>' },
    ],
    [
      'insert_blocks',
      { position: 'end', xml: '<p>尾</p>' },
    ],
  ]

  it('lists one item per change in document order, with adjacent new blocks as one', () => {
    const document = four()
    let proposal = propose(document, calls)
    const first = proposal.changes.find(change => change.kind === 'insert' && change.after === 'a1')!
    const firstId = first.kind === 'insert'
      ? first.blocks[0].id
      : ''
    // A second new block right after the first one, in a later turn.
    proposal = propose(document, [
      [
        'insert_blocks',
        { position: 'after', blockId: firstId, xml: '<p>乙</p>' },
      ],
    ], proposal, 2)

    const items = reviewItems(document, proposal)
    expect(states(items)).toEqual([
      'insert:pending',
      'replace:pending',
      'delete:pending',
      'insert:pending',
    ])
    expect(items[0].after.map(textOf)).toEqual(['甲', '乙'])
    expect(items[0].before).toEqual([])
    expect(items[0].blockIds).toHaveLength(2)
    expect(items[0].turn).toBe(2)
    expect(items[1]).toMatchObject({
      blockIds: ['b2'],
      turn: 1,
    })
    expect(items[1].before.map(textOf)).toEqual(['二'])
    expect(items[1].after.map(textOf)).toEqual(['新二'])
    expect(items[2].before.map(textOf)).toEqual(['三'])
    expect(items[2].after).toEqual([])
    expect(items[3].after.map(textOf)).toEqual(['尾'])
    expect(new Set(items.map(item => item.id)).size).toBe(4)
    expect(reviewItems(document, proposal).map(item => item.id)).toEqual(items.map(item => item.id))
  })

  it('tells the state of a replacement from the block as it is now', () => {
    const document = four()
    const proposal = propose(document, [
      [
        'replace_block',
        { blockId: 'b2', xml: '<p>新二</p>' },
      ],
    ])
    const node = proposal.changes[0].kind === 'replace'
      ? proposal.changes[0].node
      : null

    expect(states(reviewItems(document, proposal))).toEqual(['replace:pending'])
    expect(states(reviewItems(withBlock(document, 'b2', () => copy(node) as Json), proposal))).toEqual(['replace:accepted'])
    expect(states(reviewItems(edited(document, 'b2', '別的'), proposal))).toEqual(['replace:conflict'])
    expect(reviewItems(without(document, 'b2'), proposal)).toEqual([])
  })

  it('tells the state of a deletion and of new blocks the same way', () => {
    const document = four()
    const deletion = propose(document, [
      [
        'delete_block',
        { blockId: 'c3' },
      ],
    ])
    expect(states(reviewItems(document, deletion))).toEqual(['delete:pending'])
    expect(states(reviewItems(without(document, 'c3'), deletion))).toEqual(['delete:accepted'])
    expect(states(reviewItems(edited(document, 'c3', '改過'), deletion))).toEqual(['delete:conflict'])

    const insertion = propose(document, [
      [
        'insert_blocks',
        { position: 'end', xml: '<p>尾</p>' },
      ],
    ])
    expect(states(reviewItems(document, insertion))).toEqual(['insert:pending'])
    const applied = acceptAll(document, insertion).document
    expect(states(reviewItems(applied, insertion))).toEqual(['insert:accepted'])
  })

  it('finds another place for new blocks when a neighbour is gone, and is in conflict when both are', () => {
    const document = four()
    const proposal = propose(document, [
      [
        'insert_blocks',
        { position: 'after', blockId: 'b2', xml: '<p>中間</p>' },
      ],
    ])

    const noBefore = without(document, 'b2')
    expect(states(reviewItems(noBefore, proposal))).toEqual(['insert:pending'])
    expect(textsOf(acceptAll(noBefore, proposal).document)).toEqual(['一', '中間', '三', '四'])

    const noAfter = without(document, 'c3')
    expect(states(reviewItems(noAfter, proposal))).toEqual(['insert:pending'])
    expect(textsOf(acceptAll(noAfter, proposal).document)).toEqual(['一', '二', '中間', '四'])

    const neither = without(noBefore, 'c3')
    expect(states(reviewItems(neither, proposal))).toEqual(['insert:conflict'])
  })
})

describe('accepting', () => {
  const calls: [string, unknown][] = [
    [
      'replace_block',
      { blockId: 'b2', xml: '<h2>新二</h2>' },
    ],
    [
      'delete_block',
      { blockId: 'c3' },
    ],
    [
      'insert_blocks',
      { position: 'before', blockId: 'a1', xml: '<p>頭</p>' },
    ],
  ]

  it('one item at a time gives a new document and a proposal that remembers it', () => {
    const start = freeze(four())
    let proposal = freeze(propose(four(), calls))
    let document: AgentDocument = start
    const before = reviewItems(start, proposal)
    expect(states(before)).toEqual(['insert:pending', 'replace:pending', 'delete:pending'])

    for (const item of before) {
      const result = acceptItem(document, proposal, item.id)
      expect(result.ok).toBe(true)
      expect(result.document).not.toBe(document)
      expect(result.proposal).not.toBe(proposal)
      document = freeze(result.document)
      proposal = freeze(result.proposal)
    }

    expect(textsOf(document)).toEqual(['頭', '一', '新二', '四'])
    expect(blocksOf(document)[2]).toMatchObject({
      type: 'heading',
      $: { blockId: 'b2' },
    })
    expect(idsOf(document)[0]).toMatch(ID)
    expect(textsOf(start)).toEqual(['一', '二', '三', '四'])
    expect(states(reviewItems(document, proposal))).toEqual(['insert:accepted', 'replace:accepted', 'delete:accepted'])
    // The document from before the accepting, as after undo: everything is pending again.
    expect(states(reviewItems(start, proposal))).toEqual(['insert:pending', 'replace:pending', 'delete:pending'])
    // Editing the replaced block afterwards closes that item; it is not a conflict.
    expect(states(reviewItems(edited(document, 'b2', '接受後又改'), proposal))).toEqual(['insert:accepted', 'delete:accepted'])
  })

  it('gives a document the editor reads as it is', () => {
    const { document } = acceptAll(four(), propose(four(), [
      ...calls,
      [
        'insert_blocks',
        { position: 'end', xml: '<ul><li><p>項目 <b>粗</b></p></li></ul><blockquote>引用</blockquote><hr />' },
      ],
    ]))
    const editor = createHeadlessEditor({
      nodes: allHeadlessNodes,
      onError: (error) => {
        throw error
      },
    })
    const loaded = editor.parseEditorState(JSON.stringify(document)).toJSON()
    expect(copy(loaded)).toEqual(copy(editor.parseEditorState(JSON.stringify(loaded)).toJSON()))
    expect(idsOf(loaded as AgentDocument)).toEqual(idsOf(document))
    expect(textsOf(loaded as AgentDocument)).toEqual(textsOf(document))
  })

  it('all at once applies what is pending and leaves a conflict alone', () => {
    const document = edited(four(), 'd4', '使用者改了四')
    const proposal = propose(four(), [
      ...calls,
      [
        'replace_block',
        { blockId: 'd4', xml: '<p>AI 的四</p>' },
      ],
    ])
    expect(states(reviewItems(document, proposal))).toContain('replace:conflict')

    const result = acceptAll(freeze(document), freeze(proposal))
    expect(result.ok).toBe(true)
    expect(textsOf(result.document)).toEqual(['頭', '一', '新二', '使用者改了四'])
    // An accepted deletion has no place in the document any more, so it comes after the rest.
    expect(states(reviewItems(result.document, result.proposal))).toEqual([
      'insert:accepted',
      'replace:accepted',
      'replace:conflict',
      'delete:accepted',
    ])
  })

  it('a conflict is applied only when asked to overwrite', () => {
    const base = four()
    const proposal = propose(base, [
      [
        'replace_block',
        { blockId: 'b2', xml: '<p>AI 的二</p>' },
      ],
      [
        'insert_blocks',
        { position: 'after', blockId: 'c3', xml: '<p>新的</p>' },
      ],
    ])
    const document = without(without(edited(base, 'b2', '使用者的二'), 'c3'), 'd4')
    const [replacement, insertion] = reviewItems(document, proposal)
    expect(states([replacement, insertion])).toEqual(['replace:conflict', 'insert:conflict'])

    for (const item of [replacement, insertion]) {
      const refused = acceptItem(document, proposal, item.id)
      expect(refused.ok).toBe(false)
      expect(refused.document).toBe(document)
      expect(refused.proposal).toBe(proposal)
      expect(refused.reason).toMatch(/conflict/i)
    }

    const first = acceptItem(document, proposal, replacement.id, { overwrite: true })
    expect(first.ok).toBe(true)
    expect(textsOf(first.document)).toEqual(['一', 'AI 的二'])
    const second = acceptItem(first.document, first.proposal, insertion.id, { overwrite: true })
    expect(textsOf(second.document)).toEqual(['一', 'AI 的二', '新的'])
    expect(states(reviewItems(second.document, second.proposal))).toEqual(['replace:accepted', 'insert:accepted'])
  })

  it('says so when there is no such item', () => {
    const document = four()
    const proposal = createProposal()
    const result = acceptItem(document, proposal, 'replace:nope')
    expect(result).toMatchObject({ ok: false, document, proposal })
    expect(result.reason).toContain('replace:nope')
  })
})

describe('rejecting and settling', () => {
  function everything() {
    const base = four()
    const proposal = propose(base, [
      [
        'replace_block',
        { blockId: 'a1', xml: '<p>AI 的一</p>' },
      ],
      [
        'replace_block',
        { blockId: 'b2', xml: '<p>AI 的二</p>' },
      ],
      [
        'delete_block',
        { blockId: 'c3' },
      ],
      [
        'insert_blocks',
        { position: 'end', xml: '<p>尾巴的內容</p>' },
      ],
    ])
    return {
      document: edited(base, 'a1', '使用者的一'),
      proposal,
    }
  }

  it('rejecting one takes it off the list and keeps a note for the model', () => {
    const { document, proposal } = everything()
    const items = reviewItems(document, proposal)
    expect(states(items)).toEqual([
      'replace:conflict',
      'replace:pending',
      'delete:pending',
      'insert:pending',
    ])

    const frozen = freeze(proposal)
    const afterOne = rejectItem(frozen, items[3].id)
    expect(afterOne).not.toBe(frozen)
    expect(states(reviewItems(document, afterOne))).toEqual(['replace:conflict', 'replace:pending', 'delete:pending'])

    const none = rejectAll(freeze(afterOne))
    expect(reviewItems(document, none)).toEqual([])

    const taken = takeRejected(freeze(none))
    expect(taken.rejected).toHaveLength(4)
    expect(taken.rejected[0]).toMatchObject({ kind: 'insert', turn: 1 })
    expect(taken.rejected[0].text).toContain('尾巴')
    expect(taken.rejected.map(rejection => rejection.kind).sort()).toEqual([
      'delete',
      'insert',
      'replace',
      'replace',
    ])
    expect(taken.proposal.rejected).toEqual([])
    expect(takeRejected(taken.proposal).rejected).toEqual([])
    expect(rejectItem(none, 'replace:nope')).toBe(none)
  })

  it('a proposal is plain data: it comes back from JSON the same', () => {
    const { document, proposal } = everything()
    const accepted = acceptItem(document, proposal, reviewItems(document, proposal)[1].id)
    const restored = JSON.parse(JSON.stringify(accepted.proposal)) as Proposal
    expect(restored).toEqual(accepted.proposal)
    expect(restored.version).toBe(1)
    expect(reviewItems(accepted.document, restored)).toEqual(reviewItems(accepted.document, accepted.proposal))
  })

  it('settling drops what is done and keeps what still needs an answer', () => {
    const { document, proposal } = everything()
    const items = reviewItems(document, proposal)
    // Accept the second replacement and the insertion; then the user edits the replaced block.
    let result = acceptItem(document, proposal, items[1].id)
    result = acceptItem(result.document, result.proposal, items[3].id)
    const later = edited(result.document, 'b2', '接受後又改')
    const rejected = rejectItem(result.proposal, 'delete:nope')

    const settled = settleProposal(later, freeze(rejected))
    expect(states(reviewItems(later, settled))).toEqual(['replace:conflict', 'delete:pending'])
    expect(settled.changes.map(change => change.kind).sort()).toEqual(['delete', 'replace'])
    expect(settled.rejected).toEqual(rejected.rejected)
    // What was dropped does not come back when the document goes back.
    expect(states(reviewItems(document, settled))).toEqual(['replace:conflict', 'delete:pending'])
    expect(settleProposal(later, settled)).toBe(settled)
  })
})
