import type { VueDecorator } from '@hakulex/vue-lexical'
import type {
  DOMConversionMap,
  DOMExportOutput,
  LexicalCommand,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical'
import type { FileData, VideoData } from '../media/types'
import {
  fileExtFromName,
  isSafeImageSrc,
  isSafeMediaSrc,
  normalizeFileDisplay,
  normalizeFileExt,
  normalizeFileName,
  normalizeFileSize,
  normalizeImageSize,
  normalizeMimeType,
} from '@hakulex/renderer'
import { vueDecorator } from '@hakulex/vue-lexical'
import { $applyNodeReplacement, createCommand, DecoratorNode } from 'lexical'
import MediaEditor from '../components/MediaEditor.vue'

export type MediaKind = 'video' | 'file'

/** Opens the dialog to add a video or file; with `nodeKey`, opens the panel beside that one instead. */
export const OPEN_MEDIA_DIALOG_COMMAND: LexicalCommand<{ kind: MediaKind, nodeKey?: NodeKey }> = createCommand('OPEN_MEDIA_DIALOG_COMMAND')
export const INSERT_VIDEO_COMMAND: LexicalCommand<VideoData> = createCommand('INSERT_VIDEO_COMMAND')
export const INSERT_FILE_COMMAND: LexicalCommand<Omit<FileData, 'display'>> = createCommand('INSERT_FILE_COMMAND')

function text(value: unknown) {
  return typeof value === 'string'
    ? value
    : ''
}

function normalizeVideo(data: Partial<Record<keyof VideoData, unknown>>): VideoData {
  return {
    src: text(data.src),
    poster: typeof data.poster === 'string'
      ? data.poster
      : undefined,
    width: normalizeImageSize(data.width),
    height: normalizeImageSize(data.height),
  }
}

function normalizeFile(data: Partial<Record<keyof FileData, unknown>>): FileData {
  return {
    src: text(data.src),
    name: normalizeFileName(data.name),
    size: normalizeFileSize(data.size),
    mimeType: normalizeMimeType(data.mimeType),
    ext: normalizeFileExt(data.ext),
    display: normalizeFileDisplay(data.display),
  }
}

export type SerializedVideoNode = Spread<Pick<VideoData, keyof VideoData>, SerializedLexicalNode>

export class VideoNode extends DecoratorNode<VueDecorator> {
  __data: VideoData

  static getType(): string {
    return 'video'
  }

  static clone(node: VideoNode): VideoNode {
    return new VideoNode(node.__data, node.__key)
  }

  static importJSON(serialized: SerializedVideoNode): VideoNode {
    return $createVideoNode(serialized).updateFromJSON(serialized)
  }

  static importDOM(): DOMConversionMap {
    return {
      video: () => ({
        conversion: (element) => {
          const video = element as HTMLVideoElement
          const src = video.getAttribute('src') ?? video.querySelector('source')?.getAttribute('src')
          return {
            node: isSafeMediaSrc(src)
              ? $createVideoNode({
                  src,
                  poster: video.getAttribute('poster') ?? undefined,
                  width: Number(video.getAttribute('width')),
                  height: Number(video.getAttribute('height')),
                })
              : null,
            // What's inside is for browsers that can't play it.
            forChild: () => null,
          }
        },
        priority: 2,
      }),
    }
  }

  constructor(data: Partial<Record<keyof VideoData, unknown>> = {}, key?: NodeKey) {
    super(key)
    this.__data = normalizeVideo(data)
  }

  exportJSON(): SerializedVideoNode {
    return {
      ...super.exportJSON(),
      ...this.__data,
    }
  }

  exportDOM(): DOMExportOutput {
    const { src, poster, width, height } = this.__data
    const element = document.createElement('video')
    if (isSafeMediaSrc(src))
      element.setAttribute('src', src)
    if (isSafeImageSrc(poster))
      element.setAttribute('poster', poster)
    if (width)
      element.setAttribute('width', String(width))
    if (height)
      element.setAttribute('height', String(height))
    element.setAttribute('controls', '')
    return { element }
  }

  createDOM(): HTMLElement {
    const element = document.createElement('div')
    element.className = 'hlx-video-block'
    return element
  }

  updateDOM(): false {
    return false
  }

  isInline(): false {
    return false
  }

  getTextContent(): string {
    return this.__data.src
  }

  getData(): VideoData {
    return this.getLatest().__data
  }

  setData(data: VideoData): this {
    const writable = this.getWritable()
    writable.__data = normalizeVideo(data)
    return writable
  }

  decorate(): VueDecorator {
    return vueDecorator(MediaEditor, this.__key, { kind: 'video', data: this.__data })
  }
}

export function $createVideoNode(data: Partial<Record<keyof VideoData, unknown>>): VideoNode {
  return $applyNodeReplacement(new VideoNode(data))
}

export function $isVideoNode(node: LexicalNode | null | undefined): node is VideoNode {
  return node instanceof VideoNode
}

export type SerializedFileNode = Spread<Pick<FileData, keyof FileData>, SerializedLexicalNode>

export class FileNode extends DecoratorNode<VueDecorator> {
  __data: FileData

  static getType(): string {
    return 'file'
  }

  static clone(node: FileNode): FileNode {
    return new FileNode(node.__data, node.__key)
  }

  static importJSON(serialized: SerializedFileNode): FileNode {
    return $createFileNode(serialized).updateFromJSON(serialized)
  }

  static importDOM(): DOMConversionMap {
    return {
      a: element => (element.hasAttribute('data-hlx-file')
        ? {
            conversion: (el) => {
              const src = el.getAttribute('href')
              if (!isSafeMediaSrc(src))
                return { node: null }
              const name = normalizeFileName(el.getAttribute('download') ?? el.querySelector('.hlx-file-name')?.textContent)
              return {
                node: $createFileNode({
                  src,
                  name,
                  size: Number(el.dataset.size ?? Number.NaN),
                  mimeType: el.dataset.mimeType,
                  ext: fileExtFromName(name),
                  display: el.dataset.display,
                }),
                // The icon, name and size inside are for display.
                forChild: () => null,
              }
            },
            priority: 2,
          }
        : null),
    }
  }

  constructor(data: Partial<Record<keyof FileData, unknown>> = {}, key?: NodeKey) {
    super(key)
    this.__data = normalizeFile(data)
  }

  exportJSON(): SerializedFileNode {
    return {
      ...super.exportJSON(),
      ...this.__data,
    }
  }

  exportDOM(): DOMExportOutput {
    const { src, name, size, mimeType, display } = this.__data
    const element = document.createElement('a')
    if (isSafeMediaSrc(src))
      element.setAttribute('href', src)
    element.setAttribute('download', name)
    element.setAttribute('data-hlx-file', '')
    if (size !== undefined)
      element.dataset.size = String(size)
    if (mimeType)
      element.dataset.mimeType = mimeType
    if (display === 'inline')
      element.dataset.display = 'inline'
    element.textContent = name
    return { element }
  }

  createDOM(): HTMLElement {
    const inline = this.isInline()
    const element = document.createElement(inline ? 'span' : 'div')
    element.className = inline ? 'hlx-file-inline' : 'hlx-file-block'
    return element
  }

  updateDOM(): false {
    return false
  }

  isInline(): boolean {
    return this.__data.display === 'inline'
  }

  // Arrow keys pass over an inline file, which is just part of the text. A block is a stop.
  isKeyboardSelectable(): boolean {
    return !this.isInline()
  }

  getTextContent(): string {
    return this.__data.name
  }

  getData(): FileData {
    return this.getLatest().__data
  }

  setData(data: FileData): this {
    const writable = this.getWritable()
    writable.__data = normalizeFile(data)
    return writable
  }

  decorate(): VueDecorator {
    return vueDecorator(MediaEditor, this.__key, { kind: 'file', data: this.__data })
  }
}

export function $createFileNode(data: Partial<Record<keyof FileData, unknown>>): FileNode {
  return $applyNodeReplacement(new FileNode(data))
}

export function $isFileNode(node: LexicalNode | null | undefined): node is FileNode {
  return node instanceof FileNode
}

export const $isMediaNode = (node: LexicalNode | null | undefined): node is VideoNode | FileNode => $isVideoNode(node) || $isFileNode(node)

/** The ones that stand on their own, as opposed to an inline file. */
export const $isMediaBlock = (node: LexicalNode | null | undefined): node is VideoNode | FileNode => $isMediaNode(node) && !node.isInline()
