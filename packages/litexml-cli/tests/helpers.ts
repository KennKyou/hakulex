import type { CliIO } from '../src/run'

/** A LiteXML document with the kinds of block the tests look at. */
export const SAMPLE_XML = [
  '<doc>',
  '  <h2>發布前的檢查</h2>',
  '  <p>這篇是 <b>草稿</b>，<i>週五</i>前要改完；連結到 <a href="https://x.test/guide">說明</a>。</p>',
  '  <ul>',
  '    <li>確認標題</li>',
  '    <li>補上 <code>alt</code> 文字</li>',
  '  </ul>',
  '  <ol>',
  '    <li>寫</li>',
  '    <li>審</li>',
  '  </ol>',
  '  <codeblock lang="ts">const ready = true</codeblock>',
  '  <alert type="warning">',
  '    <p>還沒有人審過</p>',
  '  </alert>',
  '  <steps>',
  '    <step id="s_one" title="檢查">',
  '      <p>讀一遍</p>',
  '    </step>',
  '    <step id="s_two" title="發布">',
  '      <p>按下發布</p>',
  '    </step>',
  '  </steps>',
  '  <math display="block">E = mc^2</math>',
  '  <mermaid>graph TD',
  '  A--&gt;B</mermaid>',
  '  <chart><![CDATA[{"type":"bar","data":[{"x":"一","y":3},{"x":"二","y":5}],"x":"x","y":"y"}]]></chart>',
  '  <hr />',
  '  <p>最後一段 <math>a^2</math>。</p>',
  '</doc>',
].join('\n')

/** The expected output for SAMPLE_XML with --format markdown. */
export const SAMPLE_MARKDOWN = [
  '## 發布前的檢查',
  '',
  '這篇是 **草稿**，*週五*前要改完；連結到 [說明](https://x.test/guide)。',
  '',
  '- 確認標題',
  '- 補上 `alt` 文字',
  '',
  '1. 寫',
  '2. 審',
  '',
  '```ts',
  'const ready = true',
  '```',
  '',
  '> [!WARNING]',
  '> 還沒有人審過',
  '',
  '::: steps',
  '::: step{title="檢查"}',
  '讀一遍',
  ':::',
  '::: step{title="發布"}',
  '按下發布',
  ':::',
  ':::',
  '',
  '',
  '',
  '```mermaid',
  'graph TD',
  '  A-->B',
  '```',
  '',
  '```chart',
  '{"type":"bar","data":[{"x":"一","y":3},{"x":"二","y":5}],"x":"x","y":"y"}',
  '```',
  '',
  '---',
  '',
  '最後一段 $a^2$。',
].join('\n')

export interface FakeIO extends CliIO {
  out: string
  err: string
  written: Record<string, string>
  opened: string[]
}

/** An io for run(): files live in `files`, what is written is kept. */
export function fakeIO(options: { stdin?: string, files?: Record<string, string>, openFails?: boolean } = {}): FakeIO {
  const files = { ...options.files }
  const io: FakeIO = {
    out: '',
    err: '',
    written: {},
    opened: [],
    stdin: () => options.stdin ?? '',
    stdout: (text) => { io.out += text },
    stderr: (text) => { io.err += text },
    exists: path => path in files,
    readFile: (path) => {
      if (!(path in files))
        throw new Error(`no file ${path}`)
      return files[path]
    },
    writeFile: (path, text) => {
      io.written[path] = text
      files[path] = text
    },
    tempDir: () => '/tmp/litexml-test',
    open: (path) => {
      if (options.openFails)
        throw new Error(`無法打開 ${path}。`)
      io.opened.push(path)
    },
  }
  return io
}
