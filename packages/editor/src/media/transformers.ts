import type { ElementTransformer, TextMatchTransformer } from '@lexical/markdown'
import type { FileData } from './types'
import { fileExtFromName, isSafeImageSrc, isSafeMediaSrc } from '@hakulex/renderer'
import { $isTextNode } from 'lexical'
import {
  $createFileNode,
  $createVideoNode,
  $isFileNode,
  $isVideoNode,
  FileNode,
  VideoNode,
} from '../nodes/MediaNodes'

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
}
const escapeAttribute = (value: string) => value.replace(/[&<>"]/g, char => ENTITIES[char])
function unescapeAttribute(value: string) {
  return value
    .replace(/&(?:lt|gt|quot);/g, entity => Object.keys(ENTITIES).find(char => ENTITIES[char] === entity)!)
    .replace(/&amp;/g, '&')
}

/** Reads attributes as text. None of this is ever parsed or run as HTML. */
function parseAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>()
  for (const match of source.matchAll(/([\w-]+)(?:="([^"]*)")?/g))
    attributes.set(match[1].toLowerCase(), unescapeAttribute(match[2] ?? ''))
  return attributes
}

/** Lexical has already cut the match from the line, and doesn't put it back. */
function $restoreLine(children: unknown[], line: string) {
  const [text] = children
  if ($isTextNode(text as never))
    (text as { setTextContent: (value: string) => void }).setTextContent(line)
}

export const VIDEO_SYNTAX = /^<video\s([^<>]*)>\s*(?:<\/video>\s*)?$/im
const FILE_ANCHOR = String.raw`<a\s([^<>]*)>([^<]*)<\/a>`
export const FILE_SYNTAX = /<a\s[^<>]*data-hlx-file/i

/** `<video src="..." controls></video>` alone on a line. */
export const VIDEO: ElementTransformer = {
  type: 'element',
  dependencies: [VideoNode],
  regExp: new RegExp(VIDEO_SYNTAX.source, 'i'),
  replace: (parentNode, children, match, isImport) => {
    if (!isImport)
      return false
    const attributes = parseAttributes(match[1])
    const src = attributes.get('src')
    if (!isSafeMediaSrc(src)) {
      $restoreLine(children, match[0])
      return false
    }
    const poster = attributes.get('poster')
    parentNode.replace($createVideoNode({
      src,
      poster: isSafeImageSrc(poster)
        ? poster
        : undefined,
      width: Number(attributes.get('width')),
      height: Number(attributes.get('height')),
    }))
  },
  export: (node) => {
    if (!$isVideoNode(node))
      return null
    const { src, poster, width, height } = node.getData()
    const parts = [`src="${escapeAttribute(src)}"`]
    if (isSafeImageSrc(poster))
      parts.push(`poster="${escapeAttribute(poster)}"`)
    if (width)
      parts.push(`width="${width}"`)
    if (height)
      parts.push(`height="${height}"`)
    return `<video ${parts.join(' ')} controls></video>`
  },
}

/** The file an `<a data-hlx-file>` describes, or null for an ordinary or unsafe link. */
function readFileAnchor(source: string, label: string): Partial<Record<keyof FileData, unknown>> | null {
  const attributes = parseAttributes(source)
  const src = attributes.get('href')
  if (!attributes.has('data-hlx-file') || !isSafeMediaSrc(src))
    return null
  const name = attributes.get('download') || unescapeAttribute(label)
  return {
    src,
    name,
    size: Number(attributes.get('data-size') ?? Number.NaN),
    mimeType: attributes.get('data-mime-type'),
    ext: fileExtFromName(name),
    display: attributes.get('data-display'),
  }
}

function writeFileAnchor({ src, name, size, mimeType, display }: FileData): string {
  const parts = [
    `href="${escapeAttribute(src)}"`,
    `download="${escapeAttribute(name)}"`,
    'data-hlx-file',
  ]
  if (size !== undefined)
    parts.push(`data-size="${size}"`)
  if (mimeType)
    parts.push(`data-mime-type="${escapeAttribute(mimeType)}"`)
  if (display === 'inline')
    parts.push('data-display="inline"')
  return `<a ${parts.join(' ')}>${escapeAttribute(name)}</a>`
}

/** A file alone on a line. It reads as a download link in any other markdown tool. */
export const FILE: ElementTransformer = {
  type: 'element',
  dependencies: [FileNode],
  regExp: new RegExp(`^${FILE_ANCHOR}\\s*$`, 'i'),
  replace: (parentNode, children, match, isImport) => {
    if (!isImport)
      return false
    const file = readFileAnchor(match[1], match[2])
    if (!file || file.display === 'inline') {
      $restoreLine(children, match[0])
      return false
    }
    parentNode.replace($createFileNode(file))
  },
  export: node => ($isFileNode(node) && !node.isInline()
    ? writeFileAnchor(node.getData())
    : null),
}

/** A file inside text, which only stored documents have: the menus can't make one. */
export const FILE_INLINE: TextMatchTransformer = {
  type: 'text-match',
  dependencies: [FileNode],
  importRegExp: new RegExp(FILE_ANCHOR, 'i'),
  regExp: new RegExp(`${FILE_ANCHOR}$`, 'i'),
  replace: (textNode, match) => {
    const file = readFileAnchor(match[1], match[2])
    if (file?.display === 'inline')
      textNode.replace($createFileNode(file))
  },
  export: node => ($isFileNode(node) && node.isInline()
    ? writeFileAnchor(node.getData())
    : null),
}
