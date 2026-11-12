import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as api from '../src'

describe('the package', () => {
  it('gives out the three groups of the proposal, and nothing else', () => {
    expect(Object.keys(api).sort()).toEqual([
      // Plain functions over JSON.
      'acceptAll',
      'acceptItem',
      'agentTools',
      'applyToolCall',
      'createProposal',
      'documentToXml',
      'ensureBlockIds',
      'rejectAll',
      'rejectItem',
      'reviewItems',
      'settleProposal',
      'takeRejected',
      // The conversation.
      'createAgent',
      'systemPrompt',
      // Models.
      'claudeModel',
      'scriptedModel',
    ].sort())
    for (const [name, value] of Object.entries(api)) {
      const kind = name === 'agentTools'
        ? 'object'
        : name === 'systemPrompt'
          ? 'string'
          : 'function'
      expect(typeof value, name).toBe(kind)
    }
  })

  it('does not depend on Vue or on any package that does', () => {
    const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf8'))
    const needed = {
      ...manifest.dependencies,
      ...manifest.peerDependencies,
    }
    expect(Object.keys(needed).sort()).toEqual(['@hakulex/litexml', 'lexical'])
    const litexml = JSON.parse(readFileSync(join(import.meta.dirname, '../../litexml/package.json'), 'utf8'))
    expect(Object.keys({
      ...litexml.dependencies,
      ...litexml.peerDependencies,
    })).not.toContain('vue')
  })

  it('goes from a stored document to an accepted edit with nothing but the package', async () => {
    const paragraph = (text: string) => ({
      type: 'paragraph',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      textFormat: 0,
      textStyle: '',
      children: [
        {
          type: 'text',
          version: 1,
          text,
          format: 0,
          detail: 0,
          mode: 'normal',
          style: '',
        },
      ],
    })
    let document = api.ensureBlockIds({
      root: {
        type: 'root',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        children: [
          paragraph('第一段'),
          paragraph('第二段'),
        ],
      },
    } as never)
    const [, second] = (document.root as unknown as { children: { $: { blockId: string } }[] }).children
    const agent = api.createAgent({
      getDocument: () => document,
      model: api.scriptedModel([
        [
          {
            tool: 'replace_block',
            input: { blockId: second.$.blockId, xml: '<p>改過的第二段</p>' },
          },
        ],
        [
          { text: '改好了。' },
        ],
      ]),
    })

    await agent.send('改第二段')
    document = agent.acceptAll().document

    expect(api.documentToXml(document)).toContain('改過的第二段')
    expect(agent.items()).toMatchObject([
      { kind: 'replace', state: 'accepted' },
    ])
  })
})
