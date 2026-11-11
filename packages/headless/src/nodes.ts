import type { EditorConfig, Klass, LexicalNode, NodeKey, SerializedElementNode, SerializedLexicalNode } from 'lexical'
import { CodeHighlightNode, CodeNode } from '@lexical/code-core'
import { HorizontalRuleNode } from '@lexical/extension'
import { AutoLinkNode, LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table'
import { DecoratorNode, ElementNode } from 'lexical'

/*
 * Nodes that hold a document's data and draw nothing, for reading documents on a server with
 * `@lexical/headless`. These keep the JSON they were given and give it back as it was, as the
 * editor does. `getData()` adds the defaults for fields a node doesn't have, for reading it.
 */

export type Json = Record<string, unknown>

/** Lexical's own nodes. */
export const builtinNodes: Klass<LexicalNode>[] = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  AutoLinkNode,
  HorizontalRuleNode,
  TableNode,
  TableCellNode,
  TableRowNode,
  CodeNode,
  CodeHighlightNode,
]

/** What the JSON holds apart from what Lexical writes itself. */
function ownFields(json: Json): Json {
  const { type: _type, version: _version, $: _state, ...rest } = json
  return rest
}

function stubDOM(): HTMLElement {
  return document.createElement('span')
}

/** All the text of a nested document, a line per block. */
export function nestedText(state: unknown): string {
  if (!state || typeof state !== 'object')
    return ''
  const root = (state as Json).root as Json | undefined
  return root
    ? walkText(root)
    : ''
}

function walkText(node: Json): string {
  const children = node.children as Json[] | undefined
  if (!Array.isArray(children)) {
    return typeof node.text === 'string'
      ? node.text
      : ''
  }
  return children.map(walkText).join('\n')
}

/** A node that only holds its JSON. */
export abstract class DataNode extends DecoratorNode<null> {
  __raw: Json

  constructor(raw: Json = {}, key?: NodeKey) {
    super(key)
    this.__raw = raw
  }

  /** The default for each field the node reads. */
  static defaults: Json = {}

  /** The node's fields, with the defaults for those it doesn't have. */
  getData(): Json {
    const defaults = (this.constructor as unknown as { defaults: Json }).defaults
    const raw = this.getLatest().__raw
    const data: Json = { ...defaults }
    for (const [name, value] of Object.entries(raw)) {
      if (value !== undefined && value !== null)
        data[name] = value
      else if (!(name in defaults))
        data[name] = value
    }
    return data
  }

  exportJSON(): SerializedLexicalNode {
    return {
      ...super.exportJSON(),
      ...this.getLatest().__raw,
      type: this.getType(),
    } as SerializedLexicalNode
  }

  createDOM(_config: EditorConfig): HTMLElement {
    return stubDOM()
  }

  updateDOM(): boolean {
    return false
  }

  decorate(): null {
    return null
  }

  isInline(): boolean {
    return false
  }
}

type DataNodeClass = Klass<DataNode> & { defaults: Json }

function dataNode(type: string, defaults: Json, options: { inline?: boolean, text?: (raw: Json) => string } = {}): DataNodeClass {
  class Node extends DataNode {
    static defaults = defaults

    static getType(): string {
      return type
    }

    static clone(node: Node): Node {
      return new Node(node.__raw, node.__key)
    }

    static importJSON(json: SerializedLexicalNode): Node {
      return new Node(ownFields(json as unknown as Json)).updateFromJSON(json)
    }

    isInline(): boolean {
      return options.inline ?? false
    }

    getTextContent(): string {
      return options.text
        ? options.text(this.getLatest().__raw)
        : ''
    }
  }
  Object.defineProperty(Node, 'name', { value: `${type}-node` })
  return Node as unknown as DataNodeClass
}

/** The fields of an element's JSON that Lexical doesn't write itself. */
function elementFields(json: SerializedElementNode): Json {
  const { children: _children, direction: _direction, format: _format, indent: _indent, textFormat: _textFormat, textStyle: _textStyle, ...rest } = ownFields(json as unknown as Json)
  return rest
}

/** An element whose JSON keeps the fields Lexical doesn't know, as it was given them. */
export abstract class FieldsElementNode extends ElementNode {
  __fields: Json = {}

  getField(name: string): unknown {
    return this.getLatest().__fields[name]
  }

  exportJSON(): SerializedElementNode {
    return {
      ...super.exportJSON(),
      ...this.getLatest().__fields,
      type: this.getType(),
    }
  }

  createDOM(): HTMLElement {
    return stubDOM()
  }

  updateDOM(): boolean {
    return false
  }
}

// ── Elements ──

export class SpoilerNode extends FieldsElementNode {
  static getType(): string {
    return 'spoiler'
  }

  static clone(node: SpoilerNode): SpoilerNode {
    const copy = new SpoilerNode(node.__key)
    copy.__fields = node.__fields
    return copy
  }

  static importJSON(json: SerializedElementNode): SpoilerNode {
    const node = new SpoilerNode()
    node.__fields = elementFields(json)
    return node.updateFromJSON(json)
  }

  isInline(): boolean {
    return true
  }
}

export class RubyNode extends FieldsElementNode {
  static getType(): string {
    return 'ruby'
  }

  static clone(node: RubyNode): RubyNode {
    const copy = new RubyNode(node.__key)
    copy.__fields = node.__fields
    return copy
  }

  static importJSON(json: SerializedElementNode): RubyNode {
    const node = new RubyNode()
    node.__fields = elementFields(json)
    return node.updateFromJSON(json)
  }

  /** The reading shown above the text. */
  getReading(): string {
    const reading = this.getField('reading')
    return typeof reading === 'string'
      ? reading
      : ''
  }

  isInline(): boolean {
    return true
  }
}

export class DetailsNode extends FieldsElementNode {
  static getType(): string {
    return 'details'
  }

  static clone(node: DetailsNode): DetailsNode {
    const copy = new DetailsNode(node.__key)
    copy.__fields = node.__fields
    return copy
  }

  static importJSON(json: SerializedElementNode): DetailsNode {
    const node = new DetailsNode()
    node.__fields = elementFields(json)
    return node.updateFromJSON(json)
  }

  getSummary(): string {
    const summary = this.getField('summary')
    return typeof summary === 'string'
      ? summary
      : ''
  }
}

/** A quote with an attribution. Markdown writes it as a plain quote. */
export class RichQuoteNode extends QuoteNode {
  __fields: Json = {}

  static getType(): string {
    return 'rich-quote'
  }

  static clone(node: RichQuoteNode): RichQuoteNode {
    const copy = new RichQuoteNode(node.__key)
    copy.__fields = node.__fields
    return copy
  }

  static importJSON(json: SerializedElementNode): RichQuoteNode {
    const node = new RichQuoteNode()
    node.__fields = elementFields(json)
    return node.updateFromJSON(json)
  }

  exportJSON(): SerializedElementNode {
    return {
      ...super.exportJSON(),
      ...this.getLatest().__fields,
      type: 'rich-quote',
    }
  }

  createDOM(): HTMLElement {
    return stubDOM()
  }

  updateDOM(): boolean {
    return false
  }
}

// ── Nodes that only hold data ──

export const ImageNode = dataNode('image', { src: '', altText: '' })
export const VideoNode = dataNode('video', { src: '' })
export const FileNode = dataNode('file', { src: '', name: '', display: 'block' })
export const LinkCardNode = dataNode('link-card', { url: '' })
export const KaTeXInlineNode = dataNode('katex-inline', { equation: '' }, { inline: true })
export const KaTeXBlockNode = dataNode('katex-block', { equation: '' })
export const MermaidNode = dataNode('mermaid', { diagram: '' })
export const MentionNode = dataNode('mention', { platform: '', handle: '' }, { inline: true })
export const CodeBlockNode = dataNode('code-block', { code: '', language: '' })
export const FootnoteNode = dataNode('footnote', { identifier: '' }, { inline: true })
export const FootnoteSectionNode = dataNode('footnote-section', { definitions: {} })
export const EmbedNode = dataNode('embed', { url: '', source: null })
export const CodeSnippetNode = dataNode('code-snippet', { files: [] })
export const GalleryNode = dataNode('gallery', {
  images: [],
  layout: 'grid',
  aspect: 'auto',
  fit: 'cover',
})
export const ExcalidrawNode = dataNode('excalidraw', { snapshot: '' })
export const ChartNode = dataNode('chart', { spec: '' })
export const DynamicNode = dataNode('dynamic', { url: '', props: {}, initialHeight: 320 })
export const TagNode = dataNode('tag', { text: '' }, { inline: true })
export const CommentNode = dataNode('comment', { text: '' }, { inline: true })
export const PollNode = dataNode('poll', {
  pollId: '',
  question: '',
  options: [],
  mode: 'single',
})
export const ChatNode = dataNode('chat', { variant: 'user-agent', participants: [], messages: [] })

// ── Nodes that hold documents of their own ──

export const BannerNode = dataNode('banner', { bannerType: 'note', content: null }, {
  text: raw => nestedText(raw.content),
})
export const AlertQuoteNode = dataNode('alert-quote', { alertType: 'note', content: null }, {
  text: raw => nestedText(raw.content),
})
export const NestedDocNode = dataNode('nested-doc', { content: null }, {
  text: raw => nestedText(raw.content),
})
export const GridContainerNode = dataNode('grid-container', { cols: 2, gap: '16px', cells: [] }, {
  text: raw => (Array.isArray(raw.cells)
    ? raw.cells
    : []).map(nestedText).join('\n'),
})
export const StepsNode = dataNode('steps', { steps: [] }, {
  text: raw => (Array.isArray(raw.steps)
    ? raw.steps as Json[]
    : [])
    .map(step => [
      step.title,
      nestedText(step.content),
    ].filter(Boolean).join('\n'))
    .join('\n'),
})

/** The nodes added to Lexical's. */
export const customHeadlessNodes: Klass<LexicalNode>[] = [
  SpoilerNode,
  RubyNode,
  DetailsNode,
  RichQuoteNode,
  ImageNode,
  VideoNode,
  FileNode,
  LinkCardNode,
  KaTeXInlineNode,
  KaTeXBlockNode,
  MermaidNode,
  MentionNode,
  CodeBlockNode,
  FootnoteNode,
  FootnoteSectionNode,
  EmbedNode,
  CodeSnippetNode,
  GalleryNode,
  ExcalidrawNode,
  ChartNode,
  DynamicNode,
  TagNode,
  CommentNode,
  BannerNode,
  AlertQuoteNode,
  NestedDocNode,
  GridContainerNode,
  StepsNode,
  PollNode,
  ChatNode,
] as Klass<LexicalNode>[]

/** Every node a document can hold: give these to `createHeadlessEditor`. */
export const allHeadlessNodes: Klass<LexicalNode>[] = [
  ...builtinNodes,
  ...customHeadlessNodes,
]
