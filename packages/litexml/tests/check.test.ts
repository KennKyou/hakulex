import { describe, expect, it } from 'vitest'
import { everyNode } from '../../headless/tests/fixtures'
import { checkXml, createDefaultRegistry, deserializeNodesFromXml, LitexmlRegistry, serializeToXml } from '../src/index-node'

const registry = createDefaultRegistry()
const kinds = (xml: string) => checkXml(xml, registry).map(problem => problem.kind)

describe('checkXml on LiteXML that is right', () => {
  it('finds nothing in blocks with formatting, attributes, entities and self-closing tags', () => {
    expect(checkXml('<p id="a1">一段 <b>粗體</b> 和 <a href="https://example.com/?a=1&amp;b=2">連結</a></p>', registry)).toEqual([])
    expect(checkXml('<h2>標題</h2>\n<ul><li><p>項目</p></li></ul>\n<hr />\n<img src="a.png" alt=\'圖\' />', registry)).toEqual([])
    expect(checkXml('<p>1 &lt; 2 &amp;&amp; 3 &gt; 2</p>', registry)).toEqual([])
    expect(checkXml('<p>第一行<br>第二行</p><hr>', registry)).toEqual([])
  })

  it('finds nothing in everything LiteXML itself writes', () => {
    const xml = serializeToXml(everyNode, registry)
    expect(xml).toContain('<![CDATA[')
    expect(checkXml(xml, registry)).toEqual([])
  })

  it('leaves alone what is inside CDATA and comments, and text that only looks like Markdown', () => {
    expect(checkXml('<codeblock lang="html"><![CDATA[<div class="a">不是標籤</wrong>]]></codeblock>', registry)).toEqual([])
    expect(checkXml('<!-- <p>沒關 --><p>**不是粗體** # 不是標題 - 不是清單 [x](y)</p>', registry)).toEqual([])
  })
})

describe('checkXml on what is wrong', () => {
  it('says which tag was left open', () => {
    const problems = checkXml('<p>沒有關<b>粗體</p>', registry)
    expect(problems.length).toBeGreaterThan(0)
    expect(problems[0]).toMatchObject({ kind: 'malformed', tag: 'b' })
    expect(problems[0].message).toContain('<b>')

    const open = checkXml('<p>一段</p><h2>標題', registry)
    expect(open).toHaveLength(1)
    expect(open[0]).toMatchObject({ kind: 'malformed', tag: 'h2' })
  })

  it('says which closing tag matches nothing', () => {
    const problems = checkXml('<p>一段</p></ul>', registry)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ kind: 'malformed', tag: 'ul' })
    expect(problems[0].message).toContain('</ul>')
  })

  it('catches a quote that never closes, a value without quotes, and a tag that never ends', () => {
    expect(checkXml('<p id="a1>一段</p>', registry)[0]).toMatchObject({ kind: 'malformed', tag: 'p' })
    expect(checkXml('<img src=a.png />', registry)[0]).toMatchObject({ kind: 'malformed', tag: 'img' })
    expect(checkXml('<p>一段</p><h2', registry)[0]).toMatchObject({ kind: 'malformed' })
    expect(kinds('<codeblock><![CDATA[沒有結尾</codeblock>')).toEqual(['malformed'])
  })

  it('catches a bare < in text', () => {
    const problems = checkXml('<p>1 < 2</p>', registry)
    expect(problems).toHaveLength(1)
    expect(problems[0].kind).toBe('malformed')
    expect(problems[0].message).toContain('&lt;')
  })

  it('names each tag it does not know, once', () => {
    const problems = checkXml('<p>一段 <span>字</span> <span>字</span></p><section><p>裡面</p></section>', registry)
    expect(problems.map(problem => [problem.kind, problem.tag])).toEqual([
      ['unknown-tag', 'span'],
      ['unknown-tag', 'section'],
    ])
    expect(problems[0].message).toContain('<span>')
  })

  it('goes by the registry it is given, with room for tags a reader handles itself', () => {
    const own = new LitexmlRegistry()
    own.registerReader('card', () => ({ type: 'card', version: 1 }))
    expect(checkXml('<card><front>正面</front></card>', own).map(problem => problem.tag)).toEqual(['front'])
    expect(checkXml('<card><front>正面</front></card>', own, {
      knownTags: ['front'],
    })).toEqual([])
    expect(checkXml('<p>一段</p>', own).map(problem => problem.tag)).toEqual(['p'])
  })

  it('says so when there is nothing there', () => {
    expect(kinds('')).toEqual(['empty'])
    expect(kinds('  \n\t ')).toEqual(['empty'])
    expect(kinds('<!-- 只有註解 -->')).toEqual(['empty'])
  })

  it('gives every problem a message and where it is', () => {
    for (const problem of checkXml('<p>一段<b></p><span>字</span>', registry)) {
      expect(problem.message.length).toBeGreaterThan(5)
      expect(problem.index).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('the forgiving reader', () => {
  it('still reads what checkXml turns down, as it did', () => {
    expect(deserializeNodesFromXml('<p>沒有關<b>粗體</p>', registry)).toMatchObject([
      { type: 'paragraph' },
    ])
    const passedThrough = deserializeNodesFromXml('<section><p>裡面</p></section>', registry)
    expect(passedThrough).toMatchObject([
      { type: 'paragraph' },
    ])
    expect(() => deserializeNodesFromXml('<p id="a1>一段</p>', registry)).not.toThrow()
    expect(() => deserializeNodesFromXml('', registry)).not.toThrow()
  })
})
