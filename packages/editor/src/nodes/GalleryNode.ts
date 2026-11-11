import type { VueDecorator } from '@hakulex/vue-lexical'
import type { DOMExportOutput, LexicalNode, NodeKey, SerializedLexicalNode } from 'lexical'
import { normalizeGallery } from '@hakulex/renderer'
import { vueDecorator } from '@hakulex/vue-lexical'
import { $applyNodeReplacement, DecoratorNode } from 'lexical'
import GalleryEditor from '../components/GalleryEditor.vue'

export type SerializedGalleryNode = SerializedLexicalNode & Record<string, unknown>

/**
 * A group of images. Holds the JSON as loaded, and reads it when showing it: a document nobody
 * edited has to come out the same, without the defaults it left out.
 */
export class GalleryNode extends DecoratorNode<VueDecorator> {
  __raw: Record<string, unknown>

  static getType(): string {
    return 'gallery'
  }

  static clone(node: GalleryNode): GalleryNode {
    return new GalleryNode(node.__raw, node.__key)
  }

  static importJSON(json: SerializedGalleryNode): GalleryNode {
    return $applyNodeReplacement(new GalleryNode(json)).updateFromJSON(json)
  }

  constructor(raw: Record<string, unknown> = {}, key?: NodeKey) {
    super(key)
    this.__raw = raw
  }

  exportJSON(): SerializedGalleryNode {
    return {
      ...super.exportJSON(),
      ...this.getLatest().__raw,
    }
  }

  /** For pasting somewhere else. Pasting here goes through JSON, and stays a gallery. */
  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    for (const { src, alt, width, height } of normalizeGallery(this.__raw).images) {
      const image = document.createElement('img')
      image.setAttribute('src', src)
      image.setAttribute('alt', alt)
      if (width)
        image.setAttribute('width', String(width))
      if (height)
        image.setAttribute('height', String(height))
      element.append(image)
    }
    return { element }
  }

  createDOM(): HTMLElement {
    const element = document.createElement('div')
    element.className = 'hlx-gallery-block'
    return element
  }

  updateDOM(): false {
    return false
  }

  isInline(): boolean {
    return false
  }

  getTextContent(): string {
    return normalizeGallery(this.__raw).images.map(image => image.alt).filter(Boolean).join('\n')
  }

  getFields(): Record<string, unknown> {
    return this.getLatest().__raw
  }

  /** Replaces what the fields name, removing those set to undefined. Other stored fields stay. */
  setFields(fields: Record<string, unknown>): this {
    const writable = this.getWritable()
    const raw = {
      ...writable.__raw,
      ...fields,
    }
    for (const [name, value] of Object.entries(fields)) {
      if (value === undefined)
        delete raw[name]
    }
    writable.__raw = raw
    return writable
  }

  decorate(): VueDecorator {
    return vueDecorator(GalleryEditor, this.__key, { fields: this.__raw })
  }
}

export function $createGalleryNode(fields: Record<string, unknown>): GalleryNode {
  return $applyNodeReplacement(new GalleryNode(fields))
}

export function $isGalleryNode(node: LexicalNode | null | undefined): node is GalleryNode {
  return node instanceof GalleryNode
}
