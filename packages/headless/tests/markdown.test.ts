// @vitest-environment node
import type { Json } from './fixtures'
import { createHeadlessEditor } from '@lexical/headless'
import { describe, expect, it } from 'vitest'
import { $toMarkdown, allHeadlessNodes, allHeadlessTransformers } from '../src'
import * as transformers from '../src/transformers'
import { blockMarkdown, containerMarkdown, defaultsMarkdown, doc, everyNode, inlineMarkdown, paragraph, text } from './fixtures'

/*
 * Markdown from documents, in Node with no DOM. The expected text is fixed
 * for these documents. Where there is no way to write a node
 * (a file, a block formula, a dynamic block), it writes nothing, and so does this.
 */

const expected = {
  inlineMarkdown: [
    '## 標題',
    '',
    '**粗** *斜* ~~刪~~ `code` ++底++ x^2^ H~2~O [連結](https://x.test/a)',
    '',
    '||雷|| <ruby>漢<rt>かん</rt></ruby> 字 $a^2$ [Octocat]{GH@octocat} {X@a.b-c} [^1] <tag>標籤</tag> <!--註解-->',
    '',
    '- 一',
    '- 二',
    '',
    '1. 甲',
    '2. 乙',
    '',
    '- [x] 完成',
    '- [ ] 未完',
    '',
    '> 引用',
    '',
    '> 有出處',
  ].join('\n'),
  blockMarkdown: [
    '![圖](https://x.test/a.png "說 \\"明\\"")',
    '',
    '![](https://x.test/b.png)',
    '',
    '<video src="https://x.test/v.mp4" poster="https://x.test/p.jpg" width=640 height=360 controls></video>',
    '',
    '',
    '',
    '````md',
    'a',
    '```',
    'b',
    '````',
    '',
    '```js',
    'const x = 1',
    '```',
    '',
    '```mermaid',
    'graph TD',
    '  A-->B',
    '```',
    '',
    '```chart',
    '{"type":"bar"}',
    '```',
    '',
    '',
    '',
    '[卡片](https://x.test/c)',
    '',
    '<https://x.test/d>',
    '',
    '<https://www.youtube.com/watch?v=x>',
    '',
    '---',
    '',
    '| 名稱 | 說明 |',
    '| --- | --- |',
    '| a\\|b | 一<br/>二 |',
    '',
    '![一](https://x.test/1.png)',
    '![](https://x.test/2.png)',
    '',
    '::: code-snippet',
    '::: file{name="a.ts" lang="ts"}',
    '```ts',
    'const a = 1',
    '```',
    ':::',
    '::: file{name="untitled" lang=""}',
    '````',
    '```',
    '````',
    ':::',
    ':::',
    '',
    '<!--hakulex:poll {"pollId":"p_1","mode":"multiple","closeAt":"2026-12-01","showResults":"after-vote"}-->',
    '**哪個 &lt;好&gt;？**',
    '',
    '- A &amp; B <!-- id=o_a -->',
    '- C <!-- id=o_b -->',
    '<!--/hakulex:poll-->',
    '',
    '<excalidraw>',
    '{"elements":[]}',
    '</excalidraw>',
    '',
    '[^1]: 註腳一',
    '[^note]: 另一個',
  ].join('\n'),
  containerMarkdown: [
    '> [!WARNING]',
    '> 小心',
    '> 第二行',
    '',
    '::: tip',
    '提示',
    ':::',
    '',
    '::: details{summary="更 \\"多\\""}',
    '內容',
    ':::',
    '',
    '<nested-doc>',
    '巢狀',
    '兩段',
    '</nested-doc>',
    '',
    '::: grid{cols=3 gap="8px"}',
    '::: cell',
    '左',
    ':::',
    '::: cell',
    '右',
    ':::',
    ':::',
    '',
    '::: steps',
    '::: step{title="安裝 \\"它\\""}',
    '下載',
    ':::',
    '::: step{title="設定"}',
    '加金鑰',
    ':::',
    ':::',
    '',
    '> **我:** 問題',
    '> 第二行',
    '',
    '**回答**',
    '',
    '> **Unknown:** 誰？',
    '',
    '> **Alice:** Hi',
    '',
    '> **User:** Hello',
  ].join('\n'),
  defaultsMarkdown: [
    '<!--hakulex:poll {"pollId":"p_2","mode":"single"}-->',
    '**要嗎？**',
    '',
    '- 要 <!-- id=o_y -->',
    '<!--/hakulex:poll-->',
    '',
    '> **我:** 嗨',
  ].join('\n'),
  everyNode: [
    '## 標題 **粗**',
    '',
    '**粗體** *斜體* ~~刪除~~ `code` ++底線++ ^上^ ~下~ [連結](https://x.test/a "A") https://x.test/b',
    '第二行\ttab',
    '',
    '> 引用',
    '',
    '- 項目一',
    '    - 子項',
    '- 項目二',
    '',
    '3. 第三',
    '4. 第四',
    '',
    '- [x] 完成',
    '- [ ] 未完成',
    '',
    '| 名稱 | 說明 |',
    '| --- | --- |',
    '| a\\|b | 一<br/>二 |',
    '',
    '---',
    '',
    '![圖](https://x.test/a.png "說明")',
    '',
    '<video src="https://x.test/v.mp4" poster="https://x.test/p.jpg" controls></video>',
    '',
    '',
    '',
    '[a/b](https://github.com/a/b)',
    '',
    '<https://www.youtube.com/watch?v=x>',
    '',
    '```ts',
    'const a = 1 < 2 && b',
    '# not md',
    '```',
    '',
    '```mermaid',
    'graph TD',
    '  A-->B',
    '```',
    '',
    '',
    '',
    'x $a^2$ [Octocat]{GH@octocat} <tag>標籤</tag><!--註解-->||雷||<ruby>漢<rt>かん</rt></ruby>[^1]',
    '',
    '> [!WARNING]',
    '> 小心',
    '',
    '::: tip',
    '提示',
    ':::',
    '',
    '::: details{summary="更多"}',
    '內容',
    ':::',
    '',
    '<nested-doc>',
    '巢狀',
    '</nested-doc>',
    '',
    '::: grid{cols=2 gap="16px"}',
    '::: cell',
    '左',
    ':::',
    '::: cell',
    '右',
    ':::',
    ':::',
    '',
    '::: steps',
    '::: step{title="第一步"}',
    '做這個',
    ':::',
    '::: step{title="第二步"}',
    '再做那個',
    ':::',
    ':::',
    '',
    '![一](https://x.test/1.png)',
    '![二](https://x.test/2.png)',
    '',
    '::: code-snippet',
    '::: file{name="a.ts" lang="ts"}',
    '```ts',
    'export const a = 1',
    '```',
    ':::',
    '::: file{name="b.css" lang="css"}',
    '```css',
    'a { color: red }',
    '```',
    ':::',
    ':::',
    '',
    '```chart',
    '{"type":"bar","data":[1,2]}',
    '<&>',
    '```',
    '',
    '> **我:** 你好',
    '',
    '**哈囉**',
    '',
    '<!--hakulex:poll {"pollId":"p_poll1","mode":"multiple","closeAt":"2026-12-01","showResults":"after-vote"}-->',
    '**哪個？**',
    '',
    '- A <!-- id=o_a -->',
    '- B <!-- id=o_b -->',
    '<!--/hakulex:poll-->',
    '',
    '',
    '',
    '[^1]: 註腳內容',
    '',
    '<excalidraw>',
    '{"elements":[]}',
    '</excalidraw>',
    '',
    '> 無出處',
    '',
    '```js',
    'const x = 1',
    '```',
  ].join('\n'),
}

function toMarkdown(state: Json): string {
  const editor = createHeadlessEditor({
    nodes: allHeadlessNodes,
    onError: (error) => { throw error },
  })
  return editor.parseEditorState(JSON.stringify(state)).read(() => $toMarkdown())
}

describe('the same Markdown', () => {
  it('writes text formats, inline nodes and Lexical\'s blocks', () => {
    expect(toMarkdown(inlineMarkdown)).toBe(expected.inlineMarkdown)
  })

  it('writes blocks that hold data', () => {
    expect(toMarkdown(blockMarkdown)).toBe(expected.blockMarkdown)
  })

  it('writes the text of blocks holding documents, and chats', () => {
    expect(toMarkdown(containerMarkdown)).toBe(expected.containerMarkdown)
  })

  it('uses the defaults for fields a node doesn\'t have', () => {
    expect(toMarkdown(defaultsMarkdown)).toBe(expected.defaultsMarkdown)
  })

  it('writes a document with every kind of node', () => {
    expect(toMarkdown(everyNode)).toBe(expected.everyNode)
  })

  it('exports the transformers on their own too', () => {
    expect(transformers.allHeadlessTransformers).toBe(allHeadlessTransformers)
    expect(transformers.$toMarkdown).toBe($toMarkdown)
  })
})

describe('chat', () => {
  const chat = (node: Json) => toMarkdown(doc({ type: 'chat', version: 1, ...node }))

  it('user-agent: a quote for the user, paragraphs for the agent', () => {
    const md = chat({
      variant: 'user-agent',
      participants: [
        { id: 'p_u', kind: 'user', name: 'Octocat' },
        { id: 'p_a', kind: 'agent', name: 'Claude' },
      ],
      messages: [
        { id: 'm1', participantId: 'p_u', content: 'How does X work?' },
        { id: 'm2', participantId: 'p_a', content: 'It works like this.' },
      ],
    })
    expect(md).toContain('> **Octocat:** How does X work?')
    expect(md).toContain('It works like this.')
  })

  it('user-user: a quote for both', () => {
    const md = chat({
      variant: 'user-user',
      participants: [
        { id: 'p_a', kind: 'user', name: 'Alice' },
        { id: 'p_b', kind: 'user', name: 'Bob' },
      ],
      messages: [
        { id: 'm1', participantId: 'p_a', content: 'Hi' },
        { id: 'm2', participantId: 'p_b', content: 'Hello' },
      ],
    })
    expect(md).toContain('> **Alice:** Hi')
    expect(md).toContain('> **Bob:** Hello')
  })

  it('falls back to a label for the kind when there is no name', () => {
    const md = chat({
      variant: 'user-agent',
      participants: [
        { id: 'p_u', kind: 'user' },
        { id: 'p_a', kind: 'agent' },
      ],
      messages: [
        { id: 'm1', participantId: 'p_u', content: 'q' },
        { id: 'm2', participantId: 'p_a', content: 'a' },
      ],
    })
    expect(md).toContain('> **User:** q')
    expect(md).toContain('a')
  })
})

describe('steps and rich quote', () => {
  it('writes steps as a directive block', () => {
    const steps = {
      type: 'steps',
      version: 1,
      steps: [
        {
          id: 's_a',
          title: 'Install "it"',
          content: doc(paragraph(text('Download the app'))),
        },
        {
          id: 's_b',
          title: 'Configure',
          content: doc(paragraph(text('Add the key'))),
        },
      ],
    }
    expect(toMarkdown(doc(steps))).toBe([
      '::: steps',
      '::: step{title="Install \\"it\\""}',
      'Download the app',
      ':::',
      '::: step{title="Configure"}',
      'Add the key',
      ':::',
      ':::',
    ].join('\n'))
  })

  it('writes a rich quote as a quote', () => {
    const quote = {
      type: 'rich-quote',
      version: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      attribution: 'Lu Xun',
      children: [
        paragraph(text('Hello quote')),
      ],
    }
    expect(toMarkdown(doc(quote))).toBe('> Hello quote')
  })
})
