import type { SerializedNode } from '../src'
import { renderToString } from '@vue/server-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import {
  fileExtFromName,
  fileMetaText,
  fileNameFromUrl,
  formatFileSize,
  isSafeMediaSrc,
  normalizeFileDisplay,
  normalizeFileExt,
  normalizeFileName,
  normalizeFileSize,
  normalizeMimeType,
  RichRenderer,
} from '../src'

const video = (extra: Record<string, unknown>): SerializedNode => ({ type: 'video', ...extra })
const file = (extra: Record<string, unknown>): SerializedNode => ({ type: 'file', ...extra })
const text = (value: string): SerializedNode => ({ type: 'text', text: value, format: 0 })
function documentOf(...children: SerializedNode[]) {
  return {
    root: { type: 'root', children },
  }
}

function ssr(...children: SerializedNode[]) {
  const value = documentOf(...children)
  return renderToString(createSSRApp({
    render: () => h(RichRenderer, { value }),
  }))
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('safe sources', () => {
  it.each([
    'https://example.com/a.mp4',
    'http://example.com/a.mp4',
    '/uploads/a.mp4',
    'uploads/a.mp4',
    './a.mp4',
    'a%20b.pdf',
  ])('accepts %s', (src) => {
    expect(isSafeMediaSrc(src)).toBe(true)
  })

  it.each([
    ['javascript', 'javascript:alert(1)'],
    ['mixed case javascript', 'JaVaScRiPt:alert(1)'],
    ['data video', 'data:video/mp4;base64,AAAA'],
    ['data html', 'data:text/html,<script>1</script>'],
    ['blob', 'blob:https://example.com/x'],
    ['file', 'file:///etc/passwd'],
    ['protocol relative', '//evil.example/a.mp4'],
    ['backslashes', '\\\\evil.example\\a.mp4'],
    ['leading space', ' javascript:alert(1)'],
    ['a tab hiding a scheme', 'java\tscript:alert(1)'],
    ['empty', ''],
    ['not text', 42],
    ['missing', undefined],
  ])('refuses %s', (_name, src) => {
    expect(isSafeMediaSrc(src)).toBe(false)
  })
})

describe('metadata', () => {
  it('keeps only usable values', () => {
    expect(normalizeFileSize(1536)).toBe(1536)
    expect(normalizeFileSize(0)).toBe(0)
    expect(normalizeFileSize(-1)).toBeUndefined()
    expect(normalizeFileSize(1.5)).toBeUndefined()
    expect(normalizeFileSize('5')).toBeUndefined()

    expect(normalizeMimeType('application/pdf')).toBe('application/pdf')
    expect(normalizeMimeType('nope')).toBeUndefined()
    expect(normalizeMimeType('a/b"><script>')).toBeUndefined()
    expect(normalizeMimeType(1)).toBeUndefined()

    expect(normalizeFileExt('PDF')).toBe('pdf')
    expect(normalizeFileExt('toolongextension')).toBeUndefined()
    expect(normalizeFileExt('a.b')).toBeUndefined()
    expect(normalizeFileExt(1)).toBeUndefined()

    expect(normalizeFileDisplay('inline')).toBe('inline')
    expect(normalizeFileDisplay('block')).toBe('block')
    expect(normalizeFileDisplay('weird')).toBe('block')
    expect(normalizeFileDisplay(undefined)).toBe('block')

    expect(normalizeFileName('  a.pdf ')).toBe('a.pdf')
    expect(normalizeFileName('')).toBe('檔案')
    expect(normalizeFileName(1)).toBe('檔案')
  })

  it('reads names and extensions', () => {
    expect(fileExtFromName('a.PDF')).toBe('pdf')
    expect(fileExtFromName('.hidden')).toBeUndefined()
    expect(fileExtFromName('noext')).toBeUndefined()
    expect(fileExtFromName('a.')).toBeUndefined()

    expect(fileNameFromUrl('https://example.com/docs/%E5%A0%B1%E5%91%8A.pdf?x=1#y')).toBe('報告.pdf')
    expect(fileNameFromUrl('/uploads/a.pdf')).toBe('a.pdf')
    expect(fileNameFromUrl('https://example.com/')).toBe('')
    expect(fileNameFromUrl('https://example.com/%E0%A4%A')).toBe('%E0%A4%A')
  })

  it('formats sizes', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(1023)).toBe('1023 B')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(1024 * 1024 * 2)).toBe('2 MB')
    expect(formatFileSize(1024 ** 3 * 1.25)).toBe('1.3 GB')
    expect(formatFileSize(1024 ** 5)).toBe('1024 TB')
  })

  it('describes a file from what it knows', () => {
    expect(fileMetaText({ name: 'a.pdf', size: 1536 })).toBe('PDF · 1.5 KB')
    expect(fileMetaText({ name: 'a', ext: 'zip' })).toBe('ZIP')
    expect(fileMetaText({ name: 'a', mimeType: 'application/pdf' })).toBe('PDF')
    expect(fileMetaText({ name: 'a', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })).toBe('')
    expect(fileMetaText({ name: 'a' })).toBe('')
  })
})

describe('video', () => {
  it('uses the native player, only loading metadata, sized by the document', async () => {
    const html = await ssr(video({
      src: 'https://example.com/a.mp4',
      poster: 'https://example.com/a.png',
      width: 640,
      height: 360,
    }))
    expect(html).toContain('<video')
    expect(html).toContain('controls')
    expect(html).toContain('preload="metadata"')
    expect(html).toContain('src="https://example.com/a.mp4"')
    expect(html).toContain('poster="https://example.com/a.png"')
    expect(html).toContain('width="640"')
    expect(html).toContain('height="360"')
    expect(html).not.toContain('hlx-video--unsized')
    // The ratio is set outright: before it plays, a browser would size the player by its poster.
    expect(html).toContain('style="aspect-ratio:640 / 360;"')
  })

  it('fills the width, its size giving only the ratio', async () => {
    const { readFileSync } = await import('node:fs')
    const css = readFileSync(`${process.cwd()}/packages/style-token/src/content.css`, 'utf8')
    const rule = css.match(/\.hlx-root \.hlx-video \{([^}]*)\}/)![1]
    expect(rule).toMatch(/(?:^|\s)width: 100%;/)
    expect(rule).toMatch(/height: auto;/)
  })

  it('reserves 16:9 without a size', async () => {
    const html = await ssr(video({ src: '/a.mp4' }))
    expect(html).toContain('hlx-video--unsized')
    expect(html).not.toContain('width=')
    expect(html).not.toContain('poster=')
  })

  it.each([
    [
      'not numbers',
      { width: '640', height: '360' },
    ],
    [
      'not positive',
      { width: -1, height: 0 },
    ],
    [
      'only one',
      { width: 640 },
    ],
  ])('reserves 16:9 when sizes are %s', async (_name, sizes) => {
    const html = await ssr(video({ src: '/a.mp4', ...sizes }))
    expect(html).toContain('hlx-video--unsized')
    expect(html).not.toContain('width=')
    expect(html).not.toContain('height=')
  })

  it.each([
    'javascript:alert(1)',
    'data:video/mp4;base64,AAAA',
    'blob:x',
    '//evil.example/a',
    42,
    undefined,
  ])('shows a note instead of %j', async (src) => {
    const html = await ssr(video({ src }))
    expect(html).not.toContain('<video')
    expect(html).not.toContain('src=')
    expect(html).toContain('hlx-media-invalid')
  })

  it.each(['javascript:alert(1)', 'data:image/svg+xml,<svg/>', 42])('drops the poster %j, keeping the video', async (poster) => {
    const html = await ssr(video({ src: '/a.mp4', poster }))
    expect(html).toContain('<video')
    expect(html).not.toContain('poster=')
  })
})

describe('file', () => {
  it('is a download link with what is known about it, escaped', async () => {
    const html = await ssr(file({
      src: '/a.pdf',
      name: '<script>x</script>.pdf',
      size: 1536,
      mimeType: 'application/pdf',
    }))
    expect(html).toContain('href="/a.pdf"')
    expect(html).toContain('download="&lt;script&gt;x&lt;/script&gt;.pdf"')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;.pdf')
    expect(html).toContain('PDF · 1.5 KB')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('hlx-file-block')
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,x',
    'blob:x',
    '//evil.example/a',
    42,
    undefined,
  ])('shows the name without a link for %j', async (src) => {
    const html = await ssr(file({ src, name: '報告.pdf' }))
    expect(html).not.toContain('<a')
    expect(html).not.toContain('href=')
    expect(html).not.toContain('download=')
    expect(html).toContain('報告.pdf')
    expect(html).toContain('hlx-file--invalid')
  })

  it('takes bad values as missing', async () => {
    const html = await ssr(file({
      src: '/a',
      name: 42,
      size: -1,
      mimeType: 'nope',
      ext: 'a.b',
      display: 'weird',
    }))
    expect(html).toContain('檔案')
    expect(html).toContain('hlx-file-block')
    expect(html).not.toContain('data-size')
    expect(html).not.toContain('data-mime-type')
  })

  it('stays inline inside a paragraph, with valid HTML', async () => {
    const html = await ssr({
      type: 'paragraph',
      children: [
        text('前'),
        file({ src: '/a.pdf', name: 'a.pdf', display: 'inline' }),
        text('後'),
      ],
    })
    expect(html).toContain('hlx-file--inline')
    expect(html).toContain('<span class="hlx-file-inline">')
    expect(html).not.toContain('hlx-file-block')
    expect(html).not.toMatch(/<p[^>]*>.*<div/)
  })
})

it('hydrates server output without warnings', async () => {
  const value = documentOf(
    video({ src: '/a.mp4', width: 640, height: 360 }),
    video({ src: 'javascript:alert(1)' }),
    file({ src: '/a.pdf', name: 'a.pdf', size: 10 }),
    file({ src: 'javascript:alert(1)', name: 'b.pdf' }),
  )
  const html = await renderToString(createSSRApp({
    render: () => h(RichRenderer, { value }),
  }))
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.append(host)
  createSSRApp({
    render: () => h(RichRenderer, { value }),
  }).mount(host)
  expect(warn).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
  warn.mockRestore()
  error.mockRestore()
})
