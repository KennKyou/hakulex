import type { CalloutType } from '@hakulex/renderer'
import type {
  DOMConversionMap,
  DOMExportOutput,
  LexicalNode,
  NodeKey,
  SerializedElementNode,
  Spread,
} from 'lexical'
import { CALLOUT_ICON_ATTRS, CALLOUT_ICONS, CALLOUT_LABELS, CHEVRON_RIGHT, normalizeCalloutType } from '@hakulex/renderer'
import { $applyNodeReplacement, createCommand, ElementNode } from 'lexical'

export type CalloutKind = 'alert' | 'banner' | 'details'

/** Inserts an empty block of this kind at the selection, with the caret inside. */
export const INSERT_CALLOUT_COMMAND = createCommand<CalloutKind>('INSERT_CALLOUT_COMMAND')

const typeOf = (value: unknown): CalloutType => normalizeCalloutType(value) ?? 'note'

const SVG = 'http://www.w3.org/2000/svg'

/** An icon's <svg>, drawn as the renderer draws it. */
function iconSvg(shapes: { tag: string, attrs: Record<string, string> }[]): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg')
  for (const [name, value] of Object.entries(CALLOUT_ICON_ATTRS)) {
    if (name !== 'xmlns')
      svg.setAttribute(name, value)
  }
  for (const shape of shapes) {
    const element = document.createElementNS(SVG, shape.tag)
    for (const [name, value] of Object.entries(shape.attrs))
      element.setAttribute(name, value)
    svg.append(element)
  }
  return svg
}

/** The type's icon and name, as the renderer draws them. Not content: Lexical never sees it. */
function fillCalloutLabel(label: Element, className: string, type: CalloutType) {
  const icon = document.createElement('span')
  icon.className = 'hlx-callout-icon'
  icon.setAttribute('aria-hidden', 'true')
  icon.append(iconSvg(CALLOUT_ICONS[type]))
  const title = document.createElement('span')
  // A banner shows only the icon; its name stays for screen readers.
  title.className = className === 'hlx-banner'
    ? 'hlx-callout-title hlx-visually-hidden'
    : 'hlx-callout-title'
  title.textContent = CALLOUT_LABELS[type]
  label.replaceChildren(icon, title)
}

function createCalloutDOM(className: string, type: CalloutType): HTMLElement {
  const root = document.createElement('div')
  root.className = className
  root.dataset.type = type
  const label = document.createElement('div')
  label.className = 'hlx-callout-label'
  label.contentEditable = 'false'
  fillCalloutLabel(label, className, type)
  const body = document.createElement('div')
  body.className = 'hlx-callout-body'
  root.append(label, body)
  return root
}

/**
 * The parts all three blocks share. They hold their own blocks like a table cell
 * does, so the caret, undo and the slash menu work without a nested editor.
 */
abstract class ContainerNode extends ElementNode {
  isShadowRoot(): boolean {
    return true
  }

  canIndent(): false {
    return false
  }

  canBeEmpty(): false {
    return false
  }

  isInline(): false {
    return false
  }
}

abstract class TypedCalloutNode extends ContainerNode {
  __calloutType: CalloutType

  constructor(type: unknown, key?: NodeKey) {
    super(key)
    this.__calloutType = typeOf(type)
  }

  getCalloutType(): CalloutType {
    return this.getLatest().__calloutType
  }

  setCalloutType(type: CalloutType): this {
    const writable = this.getWritable()
    writable.__calloutType = type
    return writable
  }

  updateDOM(previous: this, dom: HTMLElement): false {
    if (previous.__calloutType !== this.__calloutType) {
      dom.dataset.type = this.__calloutType
      const label = dom.querySelector(':scope > .hlx-callout-label')
      if (label) {
        fillCalloutLabel(label, dom.classList.contains('hlx-banner')
          ? 'hlx-banner'
          : 'hlx-alert', this.__calloutType)
      }
    }
    return false
  }

  getDOMSlot(element: HTMLElement) {
    return super.getDOMSlot(element).withElement(element.querySelector<HTMLElement>(':scope > .hlx-callout-body')!)
  }

  /** Labels aren't content: exported HTML keeps only what is needed to read it back. */
  protected exportCallout(kind: string): DOMExportOutput {
    const element = document.createElement('div')
    element.dataset.hlxCallout = kind
    element.dataset.type = this.getCalloutType()
    return { element }
  }
}

export type SerializedAlertNode = Spread<{ alertType: CalloutType }, SerializedElementNode>

export class AlertNode extends TypedCalloutNode {
  static getType(): string {
    return 'alert-quote'
  }

  static clone(node: AlertNode): AlertNode {
    return new AlertNode(node.__calloutType, node.__key)
  }

  static importJSON(serialized: SerializedAlertNode): AlertNode {
    return $createAlertNode(serialized.alertType).updateFromJSON(serialized)
  }

  static importDOM(): DOMConversionMap {
    return {
      div: element => (element.dataset.hlxCallout === 'alert'
        ? {
            conversion: () => ({
              node: $createAlertNode(element.dataset.type),
            }),
            priority: 2,
          }
        : null),
    }
  }

  exportJSON(): SerializedAlertNode {
    return {
      ...super.exportJSON(),
      alertType: this.getCalloutType(),
    }
  }

  exportDOM(): DOMExportOutput {
    return this.exportCallout('alert')
  }

  createDOM(): HTMLElement {
    return createCalloutDOM('hlx-alert', this.__calloutType)
  }
}

export type SerializedBannerNode = Spread<{ bannerType: CalloutType }, SerializedElementNode>

export class BannerNode extends TypedCalloutNode {
  static getType(): string {
    return 'banner'
  }

  static clone(node: BannerNode): BannerNode {
    return new BannerNode(node.__calloutType, node.__key)
  }

  static importJSON(serialized: SerializedBannerNode): BannerNode {
    return $createBannerNode(serialized.bannerType).updateFromJSON(serialized)
  }

  static importDOM(): DOMConversionMap {
    return {
      div: element => (element.dataset.hlxCallout === 'banner'
        ? {
            conversion: () => ({
              node: $createBannerNode(element.dataset.type),
            }),
            priority: 2,
          }
        : null),
    }
  }

  exportJSON(): SerializedBannerNode {
    return {
      ...super.exportJSON(),
      bannerType: this.getCalloutType(),
    }
  }

  exportDOM(): DOMExportOutput {
    return this.exportCallout('banner')
  }

  createDOM(): HTMLElement {
    return createCalloutDOM('hlx-banner', this.__calloutType)
  }
}

/** `textFormat` is only stored: nothing here reads it, but it stays in the document. */
export type SerializedDetailsNode = Spread<{ summary: string, open: boolean, textFormat?: number }, SerializedElementNode>

export class DetailsNode extends ContainerNode {
  __summary: string
  __open: boolean
  __storedTextFormat: number | undefined

  static getType(): string {
    return 'details'
  }

  static clone(node: DetailsNode): DetailsNode {
    const clone = new DetailsNode(node.__summary, node.__open, node.__key)
    clone.__storedTextFormat = node.__storedTextFormat
    return clone
  }

  static importJSON(serialized: SerializedDetailsNode): DetailsNode {
    const node = $createDetailsNode(serialized.summary, serialized.open).updateFromJSON(serialized)
    node.__storedTextFormat = serialized.textFormat
    return node
  }

  static importDOM(): DOMConversionMap {
    return {
      details: element => ({
        conversion: () => ({
          node: $createDetailsNode(
            element.querySelector(':scope > summary')?.textContent?.trim() ?? '',
            element.hasAttribute('open'),
          ),
        }),
        priority: 2,
      }),
      // Already read as the block's summary; don't let it come through as text too.
      summary: element => (element.parentElement?.tagName === 'DETAILS'
        ? {
            conversion: () => ({
              node: null,
              after: () => [],
            }),
            priority: 2,
          }
        : null),
    }
  }

  constructor(summary: unknown = '', open: unknown = false, key?: NodeKey) {
    super(key)
    this.__summary = typeof summary === 'string'
      ? summary
      : ''
    this.__open = open === true
  }

  exportJSON(): SerializedDetailsNode {
    return {
      ...super.exportJSON(),
      summary: this.getSummary(),
      open: this.getOpen(),
      ...(this.__storedTextFormat === undefined
        ? {}
        : { textFormat: this.__storedTextFormat }),
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('details')
    element.open = this.getOpen()
    const summary = document.createElement('summary')
    summary.textContent = this.getSummary()
    element.append(summary)
    return { element }
  }

  createDOM(): HTMLElement {
    const root = document.createElement('details')
    root.className = 'hlx-details'
    root.open = this.__open
    const summary = document.createElement('summary')
    summary.className = 'hlx-details-summary'
    summary.contentEditable = 'false'
    // An arrow before the summary, as the renderer has it.
    const chevron = document.createElement('span')
    chevron.className = 'hlx-details-chevron'
    chevron.setAttribute('aria-hidden', 'true')
    chevron.append(iconSvg(CHEVRON_RIGHT))
    const text = document.createElement('span')
    text.className = 'hlx-details-summary-text'
    text.textContent = this.__summary
    summary.append(chevron, text)
    const body = document.createElement('div')
    body.className = 'hlx-details-body'
    root.append(summary, body)
    return root
  }

  updateDOM(previous: DetailsNode, dom: HTMLDetailsElement): false {
    if (previous.__open !== this.__open)
      dom.open = this.__open
    if (previous.__summary !== this.__summary) {
      const text = dom.querySelector(':scope > summary > .hlx-details-summary-text')
      if (text)
        text.textContent = this.__summary
    }
    return false
  }

  getDOMSlot(element: HTMLElement) {
    return super.getDOMSlot(element).withElement(element.querySelector<HTMLElement>(':scope > .hlx-details-body')!)
  }

  getSummary(): string {
    return this.getLatest().__summary
  }

  setSummary(summary: string): this {
    const writable = this.getWritable()
    writable.__summary = summary
    return writable
  }

  getOpen(): boolean {
    return this.getLatest().__open
  }

  setOpen(open: boolean): this {
    const writable = this.getWritable()
    writable.__open = open
    return writable
  }
}

export function $createAlertNode(type: unknown = 'note'): AlertNode {
  return $applyNodeReplacement(new AlertNode(type))
}

export function $createBannerNode(type: unknown = 'note'): BannerNode {
  return $applyNodeReplacement(new BannerNode(type))
}

export function $createDetailsNode(summary: unknown = '', open: unknown = false): DetailsNode {
  return $applyNodeReplacement(new DetailsNode(summary, open))
}

export function $isAlertNode(node: LexicalNode | null | undefined): node is AlertNode {
  return node instanceof AlertNode
}

export function $isBannerNode(node: LexicalNode | null | undefined): node is BannerNode {
  return node instanceof BannerNode
}

export function $isDetailsNode(node: LexicalNode | null | undefined): node is DetailsNode {
  return node instanceof DetailsNode
}

export function $isCalloutNode(node: LexicalNode | null | undefined): node is AlertNode | BannerNode | DetailsNode {
  return $isAlertNode(node) || $isBannerNode(node) || $isDetailsNode(node)
}
