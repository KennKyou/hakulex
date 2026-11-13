import type { VueDecorator } from '@hakulex/vue-lexical'
import type {
  DOMConversionMap,
  DOMExportOutput,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical'
import type { ImageData } from '../image/types'
import { imageLayoutAttrs, isSafeImageSrc, normalizeCaption, normalizeDisplayWidth, normalizeImageLayout, normalizeImageSize } from '@hakulex/renderer'
import { vueDecorator } from '@hakulex/vue-lexical'
import { $applyNodeReplacement, createCommand, DecoratorNode } from 'lexical'
import ImageEditor from '../components/ImageEditor.vue'
import { isFileId } from '../image/types'

export type SerializedImageNode = Spread<{
  src: string
  altText: string
  width?: number
  height?: number
  caption?: string
  displayWidth?: number
  thumbhash?: unknown
  accent?: unknown
  layout?: unknown
  fileId?: unknown
}, SerializedLexicalNode>

/** Fields only stored: nothing here reads them, but they stay in the document. */
const KEPT_FIELDS = [
  'thumbhash',
  'accent',
  'layout',
  'fileId',
] as const
/** These describe the picture, so they don't outlive it. */
const PICTURE_FIELDS: readonly string[] = ['thumbhash', 'accent', 'fileId']

/** The renderer's attributes for a layout, on a block that may have had others. */
function applyLayout(block: HTMLElement, layout: unknown, displayWidth: number | undefined) {
  const attrs = imageLayoutAttrs(layout, displayWidth)
  if (attrs['data-layout'])
    block.dataset.layout = attrs['data-layout']
  else
    delete block.dataset.layout
  if (attrs.style)
    block.style.setProperty('--hlx-image-width', `${displayWidth}%`)
  else
    block.style.removeProperty('--hlx-image-width')
}

/** Inserts an image at the selection, after the caller has validated `src`. */
export const INSERT_IMAGE_COMMAND = createCommand<ImageData>('INSERT_IMAGE_COMMAND')

/** Opens the image dialog to insert one; with `nodeKey`, opens the panel beside that image instead. */
export const OPEN_IMAGE_DIALOG_COMMAND = createCommand<{ nodeKey: NodeKey } | void>('OPEN_IMAGE_DIALOG_COMMAND')

/**
 * A block-level image. Serializes as `image` with fixed field names. Of its other fields, those in `KEPT_FIELDS` stay in the
 * document; anything else is not kept.
 */
export class ImageNode extends DecoratorNode<VueDecorator> {
  __src: string
  __altText: string
  __width: number | undefined
  __height: number | undefined
  __caption: string | undefined
  __displayWidth: number | undefined
  __kept: Partial<Record<(typeof KEPT_FIELDS)[number], unknown>> = {}

  static getType(): string {
    return 'image'
  }

  static clone(node: ImageNode): ImageNode {
    const clone = new ImageNode(node.__src, node.__altText, node.__width, node.__height, node.__caption, node.__displayWidth, node.__key)
    clone.__kept = node.__kept
    return clone
  }

  static importJSON(serialized: SerializedImageNode): ImageNode {
    // Kept fields, `fileId` among them, are copied as they were just below.
    const { fileId: _fileId, ...data } = serialized
    const node = $createImageNode(data).updateFromJSON(serialized)
    for (const field of KEPT_FIELDS) {
      if (Object.hasOwn(serialized, field))
        node.__kept[field] = serialized[field]
    }
    return node
  }

  static importDOM(): DOMConversionMap {
    return {
      img: () => ({
        conversion: (element) => {
          const node = $imageFromElement(element as HTMLElement)
          return { node }
        },
        priority: 1,
      }),
      figure: () => ({
        conversion: (element) => {
          const image = element.querySelector('img')
          const node = image && $imageFromElement(image, element.querySelector('figcaption')?.textContent ?? undefined)
          // Without an image, the caption comes through as ordinary text.
          return node
            ? {
                node,
                after: () => [],
              }
            : { node: null }
        },
        priority: 1,
      }),
    }
  }

  constructor(src = '', altText = '', width?: number, height?: number, caption?: string, displayWidth?: number, key?: NodeKey) {
    super(key)
    this.__src = src
    this.__altText = altText
    this.__width = normalizeImageSize(width)
    this.__height = normalizeImageSize(height)
    this.__caption = normalizeCaption(caption)
    this.__displayWidth = normalizeDisplayWidth(displayWidth)
  }

  exportJSON(): SerializedImageNode {
    const { src, altText, width, height, caption, displayWidth } = this.getData()
    return {
      ...super.exportJSON(),
      ...this.getLatest().__kept,
      src,
      altText,
      ...(width
        ? { width }
        : {}),
      ...(height
        ? { height }
        : {}),
      ...(caption
        ? { caption }
        : {}),
      ...(displayWidth
        ? { displayWidth }
        : {}),
    }
  }

  exportDOM(): DOMExportOutput {
    const { src, altText, width, height, caption, displayWidth, layout } = this.getData()
    if (!isSafeImageSrc(src))
      return { element: null }
    const image = document.createElement('img')
    image.setAttribute('src', src)
    image.setAttribute('alt', altText)
    if (width)
      image.setAttribute('width', String(width))
    if (height)
      image.setAttribute('height', String(height))
    if (displayWidth)
      image.style.width = `${displayWidth}%`
    const shownLayout = normalizeImageLayout(layout)
    if (shownLayout)
      image.dataset.layout = shownLayout
    if (!caption)
      return { element: image }
    const figure = document.createElement('figure')
    const figcaption = document.createElement('figcaption')
    figcaption.textContent = caption
    figure.append(image, figcaption)
    return { element: figure }
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div')
    div.className = 'hlx-image-block'
    applyLayout(div, this.__kept.layout, this.__displayWidth)
    return div
  }

  updateDOM(previous: ImageNode, dom: HTMLElement): false {
    if (previous.__kept.layout !== this.__kept.layout || previous.__displayWidth !== this.__displayWidth)
      applyLayout(dom, this.__kept.layout, this.__displayWidth)
    return false
  }

  isInline(): false {
    return false
  }

  isKeyboardSelectable(): boolean {
    return true
  }

  getTextContent(): string {
    return this.getLatest().__altText
  }

  getData(): ImageData {
    const { __src: src, __altText: altText, __width: width, __height: height, __caption: caption, __displayWidth: displayWidth } = this.getLatest()
    return {
      src,
      altText,
      width,
      height,
      caption,
      displayWidth,
      layout: this.getLatest().__kept.layout,
    }
  }

  setData({ src, altText, width, height, caption, displayWidth, layout, fileId }: ImageData): this {
    const writable = this.getWritable()
    const { layout: _layout, ...rest } = writable.__kept
    writable.__kept = {
      ...(writable.__src === src
        ? rest
        : Object.fromEntries(Object.entries(rest).filter(([field]) => !PICTURE_FIELDS.includes(field)))),
      ...(layout === undefined
        ? {}
        : { layout }),
      // A new picture brings its own id; without one, the old id went with the old picture.
      ...(isFileId(fileId)
        ? { fileId }
        : {}),
    }
    writable.__src = src
    writable.__altText = altText
    writable.__width = normalizeImageSize(width)
    writable.__height = normalizeImageSize(height)
    writable.__caption = normalizeCaption(caption)
    writable.__displayWidth = normalizeDisplayWidth(displayWidth)
    return writable
  }

  setDisplayWidth(displayWidth: number | undefined): this {
    const writable = this.getWritable()
    writable.__displayWidth = normalizeDisplayWidth(displayWidth)
    return writable
  }

  decorate(): VueDecorator {
    return vueDecorator(ImageEditor, this.__key, {
      ...this.getData(),
    })
  }
}

export function $createImageNode({ src, altText, width, height, caption, displayWidth, layout, fileId }: ImageData): ImageNode {
  const node = $applyNodeReplacement(new ImageNode(src, altText, width, height, caption, displayWidth))
  node.__kept = {
    ...(layout === undefined
      ? {}
      : { layout }),
    ...(isFileId(fileId)
      ? { fileId }
      : {}),
  }
  return node
}

/** The node for a safe `<img>`, or `null`. A percentage width becomes the display width. */
function $imageFromElement(element: HTMLElement, caption?: string): ImageNode | null {
  const src = element.getAttribute('src')
  if (!isSafeImageSrc(src))
    return null
  const percent = /^(\d+(?:\.\d+)?)%$/.exec(element.style.width)
  return $createImageNode({
    src,
    altText: element.getAttribute('alt') ?? '',
    width: Number(element.getAttribute('width')) || undefined,
    height: Number(element.getAttribute('height')) || undefined,
    caption,
    displayWidth: percent
      ? Number(percent[1])
      : undefined,
    layout: normalizeImageLayout(element.dataset.layout),
  })
}

export function $isImageNode(node: LexicalNode | null | undefined): node is ImageNode {
  return node instanceof ImageNode
}
