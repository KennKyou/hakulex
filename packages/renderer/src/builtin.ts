import type { VNodeChild } from 'vue'
import type { MentionProps } from './mention'
import type { NodeRenderer, RenderContext, SerializedNode } from './types'
import { contentTheme } from '@hakulex/style-token'
import { Comment, h } from 'vue'
import { normalizeAttribution, safeCommentText, tagHue } from './annotations'
import { CALLOUT_LABELS, normalizeCalloutType } from './callout'
import { CALLOUT_ICON_ATTRS, CALLOUT_ICONS, CHEVRON_RIGHT, LINK } from './callout-icons'
import { normalizeChat } from './chat'
import { normalizeDynamic } from './dynamic'
import { renderEmbed } from './embed'
import { footnoteItems, normalizeFootnoteIdentifier, renderFootnoteRef, renderFootnoteSection } from './footnote'
import { normalizeGallery } from './gallery'
import { normalizeGrid } from './grid'
import { imageLayoutAttrs, normalizeImageLayout, normalizeImageSize } from './image/src'
import { normalizeLinkCard } from './link-card'
import { normalizeFileDisplay } from './media'
import { mentionLabel, renderMention } from './mention'
import { contentRoot } from './nested'
import { normalizePoll } from './poll'
import { normalizeSnippetFiles } from './snippet'
import { renderSteps } from './steps'
import { renderText } from './text'
import { validateUrl } from './url'
import ChartView from './views/ChartView.vue'
import ChatView from './views/ChatView.vue'
import CodeBlockView from './views/CodeBlockView.vue'
import CodeSnippetView from './views/CodeSnippetView.vue'
import DynamicView from './views/DynamicView.vue'
import FileView from './views/FileView.vue'
import GalleryView from './views/GalleryView.vue'
import HorizontalRuleView from './views/HorizontalRuleView.vue'
import ImageView from './views/ImageView.vue'
import LinkCardView from './views/LinkCardView.vue'
import MathView from './views/MathView.vue'
import MermaidView from './views/MermaidView.vue'
import NestedDocView from './views/NestedDocView.vue'
import PollView from './views/PollView.vue'
import SpoilerView from './views/SpoilerView.vue'
import VideoView from './views/VideoView.vue'

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
const ALIGNMENTS = new Set([
  'left',
  'center',
  'right',
  'justify',
  'start',
  'end',
])

/** Lexical's ElementNode `format` (alignment), `indent` and `direction`, as DOM attributes. */
function blockAttrs(node: SerializedNode, className: string): Record<string, unknown> {
  const style: Record<string, string> = {}
  if (typeof node.format === 'string' && ALIGNMENTS.has(node.format))
    style.textAlign = node.format
  if (typeof node.indent === 'number' && node.indent > 0)
    style.paddingInlineStart = `calc(${node.indent} * var(--lexical-indent-base-value, 40px))`
  const attrs: Record<string, unknown> = {
    class: className,
    dir: node.direction === 'ltr' || node.direction === 'rtl'
      ? node.direction
      : 'auto',
  }
  // Only set when needed: Vue SSR prints `style=""` for an undefined style.
  if (Object.keys(style).length)
    attrs.style = style
  return attrs
}

/** Plain text of a subtree, for heading ids. */
function textOf(node: SerializedNode): string {
  if (node.type === 'comment')
    return ''
  if (node.type === 'mention')
    return mentionLabel(node as MentionProps)
  if (typeof node.text === 'string')
    return node.text
  return (node.children ?? []).map(textOf).join('')
}

const isList = (node: SerializedNode | undefined) => node?.type === 'list'

/** Joins theme class strings, dropping duplicates (as DOM classList would). */
function cls(...names: (string | false | undefined)[]): string {
  return [
    ...new Set(names.flatMap(name => (name
      ? name.split(' ')
      : []))),
  ].join(' ')
}

function renderLink(node: SerializedNode, ctx: RenderContext): VNodeChild {
  const children = ctx.renderChildren(node)
  const url = typeof node.url === 'string'
    ? node.url
    : ''
  // Stored content is untrusted: re-check the URL instead of relying on the editor.
  // An autolink the author removed stays as text.
  if (node.isUnlinked === true || !validateUrl(url))
    return h('span', children)
  return h('a', {
    class: contentTheme.link,
    href: url,
    rel: 'noopener noreferrer',
    target: node.target === '_blank'
      ? '_blank'
      : undefined,
    title: typeof node.title === 'string' && node.title
      ? node.title
      : undefined,
  }, children)
}

/** What a stored reading means: nothing usable when it is not text or is blank. */
export function normalizeRubyReading(reading: unknown): string {
  return typeof reading === 'string'
    ? reading.trim()
    : ''
}

/** A `<p>` can't hold these: the browser would end it early, and hydration wouldn't match. */
const BLOCKS_IN_PARAGRAPHS = new Set([
  'image',
  'video',
  'embed',
  'dynamic',
  'link-card',
  'poll',
  'chart',
  'code-snippet',
  'gallery',
  'chat',
  'steps',
  'nested-doc',
  'grid-container',
])

function isBlockInParagraph(node: SerializedNode): boolean {
  return BLOCKS_IN_PARAGRAPHS.has(node.type) || (node.type === 'file' && normalizeFileDisplay(node.display) !== 'inline')
}

/** Alert and banner share a shape: the editor's DOM has the same one. */
function renderCallout(className: string, type: unknown, node: SerializedNode, ctx: RenderContext): VNodeChild {
  const callout = normalizeCalloutType(type) ?? 'note'
  // A banner shows only the icon; its name stays for screen readers.
  const titleClass = className === 'hlx-banner'
    ? 'hlx-callout-title hlx-visually-hidden'
    : 'hlx-callout-title'
  return h('div', { 'class': className, 'data-type': callout }, [
    h('div', { class: 'hlx-callout-label' }, [
      h('span', { 'class': 'hlx-callout-icon', 'aria-hidden': 'true' }, [
        h('svg', CALLOUT_ICON_ATTRS, CALLOUT_ICONS[callout].map(shape => h(shape.tag, shape.attrs))),
      ]),
      h('span', { class: titleClass }, CALLOUT_LABELS[callout]),
    ]),
    h('div', { class: 'hlx-callout-body' }, ctx.renderChildren(node)),
  ])
}

/** Past this many blocks, a nested document starts out cut short. */
const NESTED_DOC_PREVIEW_BLOCKS = 6

/** Nothing, or one line with nothing on it: there is nothing to show. */
function isBlankDocument(root: SerializedNode): boolean {
  const blocks = root.children ?? []
  if (blocks.length > 1)
    return false
  const [first] = blocks
  return !first || (first.type === 'paragraph' && !textOf(first).trim() && !(first.children ?? []).some(child => child.type !== 'text'))
}

/** Renderers for the node types `@hakulex/editor` registers by default. */
export const builtinRenderers: Record<string, NodeRenderer> = {
  'root': (node, ctx) => ctx.renderChildren(node),

  'text': node => renderText(node),
  'linebreak': () => h('br'),
  'tab': () => '\t',

  'paragraph': (node, ctx) => {
    const children = ctx.renderChildren(node)
    // An empty paragraph still takes a line, as in the editor.
    return h((node.children ?? []).some(isBlockInParagraph)
      ? 'div'
      : 'p', blockAttrs(node, contentTheme.paragraph), children.length
      ? children
      : [
          h('br'),
        ])
  },

  'heading': (node, ctx) => {
    const tag = typeof node.tag === 'string' && HEADING_TAGS.has(node.tag)
      ? node.tag
      : 'h2'
    const attrs = blockAttrs(node, contentTheme.heading[tag as keyof typeof contentTheme.heading])
    const id = ctx.headingId(textOf(node))
    // A link to itself on its left, for readers to share. An icon only, so the
    // heading still reads and copies as its text.
    const anchor = id
      ? h('a', { 'class': 'hlx-heading-anchor', 'href': `#${id}`, 'aria-label': '連結到這個標題' }, [
          h('svg', {
            ...CALLOUT_ICON_ATTRS,
            'width': 14,
            'height': 14,
            'aria-hidden': 'true',
          }, LINK.map(shape => h(shape.tag, shape.attrs))),
        ])
      : null
    return h(tag, { ...attrs, id }, [
      anchor,
      ctx.renderChildren(node),
    ])
  },

  'quote': (node, ctx) => h('blockquote', blockAttrs(node, contentTheme.quote), ctx.renderChildren(node)),

  'rich-quote': (node, ctx) => {
    const attribution = normalizeAttribution(node.attribution)
    return h('blockquote', blockAttrs(node, contentTheme.quote), [
      ...ctx.renderChildren(node),
      attribution && h('footer', { class: contentTheme.quoteAttribution }, `— ${attribution}`),
    ])
  },

  'tag': (node) => {
    if (typeof node.text !== 'string' || !node.text.trim())
      return null
    return h('span', {
      class: contentTheme.tag,
      style: {
        '--hlx-tag-hue': String(tagHue(node.text)),
      },
    }, [
      renderText(node),
    ])
  },

  'comment': node => (typeof node.text === 'string' && node.text
    ? h(Comment, safeCommentText(node.text))
    : null),

  'code-snippet': (node) => {
    const files = normalizeSnippetFiles(node.files)
    return files.length
      ? h('div', { class: 'hlx-snippet-block' }, [
          h(CodeSnippetView, { files }),
        ])
      : null
  },

  'gallery': (node) => {
    const gallery = normalizeGallery(node)
    return gallery.images.length
      ? h('div', { class: 'hlx-gallery-block' }, [
          h(GalleryView, { gallery }),
        ])
      : null
  },

  'chat': (node) => {
    const chat = normalizeChat(node)
    return chat.messages.length
      ? h('div', { class: 'hlx-chat-block' }, [
          h(ChatView, { chat }),
        ])
      : null
  },

  'nested-doc': (node, ctx) => {
    const root = contentRoot(node.content)
    if (!root || isBlankDocument(root))
      return null
    // Up front, not in the slot: heading ids go by the order things render in.
    const children = ctx.renderChildren(root)
    return h('div', { class: 'hlx-nested-doc-block' }, [
      h(NestedDocView, { collapsible: root.children!.length > NESTED_DOC_PREVIEW_BLOCKS }, () => children),
    ])
  },

  'grid-container': (node, ctx) => {
    const { cols, gap, cells } = normalizeGrid(node)
    if (!cells.length)
      return null
    return h('div', {
      class: 'hlx-grid',
      style: {
        '--hlx-grid-cols': String(cols),
        'gap': gap,
      },
    }, cells.map(cell => h('div', { class: 'hlx-grid-cell' }, cell
      ? ctx.renderChildren(cell)
      : [])))
  },

  'steps': renderSteps,

  'embed': node => renderEmbed(node.url),

  'dynamic': (node) => {
    const { url, props, initialHeight } = normalizeDynamic(node)
    return h(DynamicView, { url, componentProps: props, initialHeight })
  },

  'chart': node => h(ChartView, { spec: node.spec }),

  'poll': (node) => {
    const poll = normalizePoll(node)
    return poll && h(PollView, poll)
  },

  'link-card': (node) => {
    const card = normalizeLinkCard(node)
    return card && h(LinkCardView, card)
  },

  'mention': node => renderMention(node as MentionProps),

  'list': (node, ctx) => {
    const ordered = node.listType === 'number'
    const className = cls(
      ordered ? contentTheme.list.ol : contentTheme.list.ul,
      node.listType === 'check' && contentTheme.list.checklist,
    )
    const start = ordered && typeof node.start === 'number' && node.start !== 1
      ? node.start
      : undefined
    return h(ordered ? 'ol' : 'ul', {
      ...blockAttrs(node, className),
      start,
    }, ctx.renderChildren(node))
  },

  'listitem': (node, ctx) => {
    const nested = isList(node.children?.[0])
    const isCheck = ctx.parent?.listType === 'check' && !nested
    const className = cls(
      contentTheme.list.listitem,
      nested && contentTheme.list.nested.listitem,
      isCheck && (node.checked ? contentTheme.list.listitemChecked : contentTheme.list.listitemUnchecked),
    )
    return h('li', {
      'class': className,
      // Only a value above 1 is written. LiteXML gives every item 1, and written
      // as it is, an ordered list would read 1, 1, 1; without it the browser counts on.
      'value': typeof node.value === 'number' && node.value > 1
        ? node.value
        : undefined,
      'role': isCheck ? 'checkbox' : undefined,
      'aria-checked': isCheck
        ? String(!!node.checked)
        : undefined,
      'aria-readonly': isCheck ? 'true' : undefined,
    }, ctx.renderChildren(node))
  },

  'link': renderLink,
  'autolink': renderLink,

  'spoiler': (node, ctx) => h(SpoilerView, null, {
    default: () => ctx.renderChildren(node),
  }),

  // Without a reading there is nothing to annotate, so only the text remains.
  'ruby': (node, ctx) => {
    const reading = normalizeRubyReading(node.reading)
    const children = ctx.renderChildren(node)
    return reading
      ? h('ruby', { class: 'hlx-ruby' }, [
          ...children,
          h('rt', reading),
        ])
      : children
  },

  'footnote': (node, ctx) => {
    const identifier = normalizeFootnoteIdentifier(node.identifier)
    if (!identifier)
      return null
    return renderFootnoteRef({
      identifier,
      number: ctx.footnotes.numbers.get(identifier),
      content: ctx.footnotes.definitions.get(identifier),
      first: ctx.once(`footnote:${identifier}`),
    })
  },

  'footnote-section': (_node, ctx) => (ctx.once('footnote-section')
    ? renderFootnoteSection(footnoteItems(ctx.footnotes))
    : null),

  'horizontalrule': () => h('div', { class: 'hlx-hr-block' }, [
    h(HorizontalRuleView),
  ]),

  // `tbody` is explicit: HTML parsers add one, and SSR must hydrate against that.
  'table': (node, ctx) => {
    const widths = Array.isArray(node.colWidths)
      ? node.colWidths.map(normalizeImageSize)
      : []
    const body = h('tbody', ctx.renderChildren(node))
    return h('div', { class: contentTheme.tableScrollableWrapper }, [
      h('table', { class: contentTheme.table }, widths.length && widths.every(Boolean)
        ? [
            h('colgroup', widths.map(width => h('col', {
              style: { width: `${width}px` },
            }))),
            body,
          ]
        : [body]),
    ])
  },

  'tablerow': (node, ctx) => h('tr', ctx.renderChildren(node)),

  // `backgroundColor` is left out on purpose: stored content doesn't get to set styles.
  'tablecell': (node, ctx) => {
    const isHeader = typeof node.headerState === 'number' && node.headerState > 0
    const width = normalizeImageSize(node.width)
    const colSpan = normalizeImageSize(node.colSpan)
    const rowSpan = normalizeImageSize(node.rowSpan)
    const attrs: Record<string, unknown> = {
      class: cls(contentTheme.tableCell, isHeader && contentTheme.tableCellHeader),
      colspan: colSpan && colSpan > 1
        ? colSpan
        : undefined,
      rowspan: rowSpan && rowSpan > 1
        ? rowSpan
        : undefined,
    }
    // Only set when needed: Vue SSR prints `style=""` for an undefined style.
    if (width)
      attrs.style = { width: `${width}px` }
    return h(isHeader ? 'th' : 'td', attrs, ctx.renderChildren(node))
  },

  'alert-quote': (node, ctx) => renderCallout('hlx-alert', node.alertType, node, ctx),

  'banner': (node, ctx) => renderCallout('hlx-banner', node.bannerType, node, ctx),

  // Native details, so readers can open it without JavaScript.
  'details': (node, ctx) => h('details', {
    class: 'hlx-details',
    open: node.open === true
      ? true
      : undefined,
  }, [
    h('summary', { class: 'hlx-details-summary' }, [
      h('span', { 'class': 'hlx-details-chevron', 'aria-hidden': 'true' }, [
        h('svg', CALLOUT_ICON_ATTRS, CHEVRON_RIGHT.map(shape => h(shape.tag, shape.attrs))),
      ]),
      h('span', { class: 'hlx-details-summary-text' }, typeof node.summary === 'string'
        ? node.summary
        : ''),
    ]),
    h('div', { class: 'hlx-details-body' }, ctx.renderChildren(node)),
  ]),

  'katex-inline': node => h('span', { class: 'hlx-math-inline' }, [
    h(MathView, {
      equation: typeof node.equation === 'string'
        ? node.equation
        : '',
    }),
  ]),

  'katex-block': node => h('div', { class: 'hlx-math-block' }, [
    h(MathView, {
      equation: typeof node.equation === 'string'
        ? node.equation
        : '',
      displayMode: true,
    }),
  ]),

  'image': node => h('div', {
    class: 'hlx-image-block',
    ...imageLayoutAttrs(node.layout, node.displayWidth),
  }, [
    h(ImageView, {
      src: typeof node.src === 'string'
        ? node.src
        : '',
      altText: typeof node.altText === 'string'
        ? node.altText
        : '',
      width: node.width as number | undefined,
      height: node.height as number | undefined,
      caption: node.caption as string | undefined,
      displayWidth: normalizeImageLayout(node.layout)
        ? undefined
        : node.displayWidth as number | undefined,
    }),
  ]),

  'video': node => h('div', { class: 'hlx-video-block' }, [
    h(VideoView, {
      src: node.src as string,
      poster: node.poster as string | undefined,
      width: node.width as number | undefined,
      height: node.height as number | undefined,
    }),
  ]),

  'file': (node) => {
    const inline = normalizeFileDisplay(node.display) === 'inline'
    return h(inline ? 'span' : 'div', {
      class: inline ? 'hlx-file-inline' : 'hlx-file-block',
    }, [
      h(FileView, {
        src: node.src as string,
        name: node.name as string | undefined,
        size: node.size as number | undefined,
        mimeType: node.mimeType as string | undefined,
        ext: node.ext as string | undefined,
        display: node.display as string | undefined,
      }),
    ])
  },

  'mermaid': node => h('div', { class: 'hlx-mermaid-block' }, [
    h(MermaidView, {
      source: typeof node.diagram === 'string'
        ? node.diagram
        : '',
    }),
  ]),

  'code-block': node => h('div', { class: 'hlx-code-block' }, [
    h(CodeBlockView, {
      code: typeof node.code === 'string'
        ? node.code
        : '',
      language: typeof node.language === 'string'
        ? node.language
        : undefined,
    }),
  ]),
}
