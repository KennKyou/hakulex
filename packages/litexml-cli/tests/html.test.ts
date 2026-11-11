// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { run } from '../src/run'
import { fakeIO } from './helpers'

/* --format html: a laid-out page that needs no JavaScript. */

const CHART = JSON.stringify({
  version: 1,
  type: 'bar',
  x: '月',
  series: [
    { key: '件' },
  ],
  data: [
    { 月: '一', 件: 3 },
    { 月: '二', 件: 5 },
  ],
})

const HTML_XML = `<doc>
  <p>質能 <math>E = mc^2</math> 的推導。</p>
  <math display="block">\\int_0^1 x\\,dx</math>
  <mermaid>graph TD
  A--&gt;B</mermaid>
  <chart><![CDATA[${CHART}]]></chart>
  <alert type="warning"><p>注意</p></alert>
</doc>`

async function html(argv: string[], io = fakeIO()): Promise<string> {
  expect(await run(argv, io)).toBe(0)
  return io.out
}

describe('--format html', () => {
  it('is a whole page with the document laid out, and no script', async () => {
    const page = await html([HTML_XML, '--format', 'html'])
    expect(page.startsWith('<!doctype html>\n<html lang="zh-Hant">')).toBe(true)
    expect(page).toContain('<meta charset="utf-8">')
    expect(page).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">')
    expect(page).toContain('<meta name="color-scheme" content="light">')
    expect(page).toContain('<title>LiteXML 預覽</title>')
    // Typeset math, diagrams and charts as SVG.
    expect(page).toContain('class="katex"')
    expect(page).toContain('class="katex-display"')
    expect(page).toMatch(/class="hlx-mermaid-svg"[^>]*><svg/)
    expect(page).toContain('class="hlx-chart-svg"')
    expect(page).toContain('class="hlx-alert"')
    expect(page).not.toContain('<script')
    expect(page.endsWith('</html>\n')).toBe(true)
  })

  it('carries its styles: hakulex\'s, and KaTeX\'s with the fonts in the page', async () => {
    const page = await html([HTML_XML, '--format', 'html'])
    expect(page).toContain('.hlx-root')
    expect(page).toContain('--hlx-color-bg')
    expect(page).toContain('.katex .katex-mathml{')
    expect(page).toContain('src:url(data:font/woff2;base64,')
    expect(page).not.toContain('url(fonts/')
    expect(page).not.toContain('<link')
    expect(page).not.toContain('@import')
  })

  it('leaves KaTeX out when there is no math', async () => {
    const page = await html(['<doc><p>沒有公式</p></doc>', '--format', 'html'])
    expect(page).toContain('.hlx-root')
    expect(page).not.toContain('@font-face')
    // hakulex's own styles have a rule for KaTeX's errors; KaTeX's stylesheet isn't there.
    expect(page).not.toContain('.katex .katex-mathml{')
  })

  it('follows --theme, --variant, --title and --lang', async () => {
    const page = await html([
      HTML_XML,
      '-f',
      'html',
      '--theme',
      'dark',
      '--variant',
      'comment',
      '--title',
      '<A & B>',
      '--lang',
      'en',
    ])
    expect(page.startsWith('<!doctype html>\n<html lang="en">')).toBe(true)
    expect(page).toContain('<meta name="color-scheme" content="dark">')
    expect(page).toContain('<title>&lt;A &amp; B&gt;</title>')
    expect(page).toMatch(/<body class="hlx-root" data-color-scheme="dark" data-variant="comment">/)
    expect(page).toMatch(/class="hlx-root[^"]*" data-variant="comment" data-color-scheme="dark"/)
  })

  it('is light and article by default, titled after the file', async () => {
    const page = await html(['posts/post.xml', '-f', 'html'], fakeIO({
      files: { 'posts/post.xml': HTML_XML },
    }))
    expect(page).toContain('<title>post.xml</title>')
    expect(page).toMatch(/class="hlx-root[^"]*" data-variant="article" data-color-scheme="light"/)
  })
})

describe('--open', () => {
  it('writes the page to -o and opens it', async () => {
    const io = fakeIO()
    expect(await run([
      HTML_XML,
      '-f',
      'html',
      '-o',
      'out.html',
      '--open',
    ], io)).toBe(0)
    expect(io.out).toBe('')
    expect(Object.keys(io.written)).toEqual(['out.html'])
    expect(io.written['out.html']).toContain('<!doctype html>')
    expect(io.opened).toEqual(['out.html'])
  })

  it('writes to a preview file in a new directory without -o', async () => {
    const io = fakeIO()
    expect(await run([HTML_XML, '-f', 'html', '--open'], io)).toBe(0)
    expect(io.out).toBe('')
    expect(io.opened).toEqual(['/tmp/litexml-test/preview.html'])
    expect(io.written['/tmp/litexml-test/preview.html']).toContain('<!doctype html>')
  })

  it('fails with the reason when the browser can\'t open it', async () => {
    const io = fakeIO({ openFails: true })
    expect(await run([
      HTML_XML,
      '-f',
      'html',
      '-o',
      'out.html',
      '--open',
    ], io)).toBe(1)
    expect(io.err).toContain('litexml: 無法打開 out.html。')
  })
})
