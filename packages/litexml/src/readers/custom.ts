import type { SerializedEditorState } from 'lexical'
import type { LitexmlRegistry } from '../registry'
import { CDATA_TAG } from '../deserializer'
import { randomId } from '../ids'

const makePollIdSuffix = () => randomId(10)
const makeOptionIdSuffix = () => randomId(6)
const makeChatParticipantId = () => randomId(6)
const makeChatMessageId = () => randomId(8)
const makeStepId = () => randomId(8)

function extractBlockId(el: Element): Record<string, any> {
  const id = el.getAttribute('id')
  return id
    ? {
        $: { blockId: id },
      }
    : {}
}

function numAttr(el: Element, name: string): number | undefined {
  const v = el.getAttribute(name)
  return v !== null
    ? Number(v)
    : undefined
}

// The image node's fields (the editor isn't a dependency of this package)
const IMAGE_LAYOUTS = new Set([
  'align-left',
  'align-right',
  'float-left',
  'float-right',
])

function imageDisplayWidthAttr(el: Element): number | undefined {
  const v = numAttr(el, 'display-width')
  return v !== undefined && Number.isFinite(v) && v >= 10 && v <= 100
    ? v
    : undefined
}

function imageFixedPxAttr(el: Element, name: string): number | undefined {
  const v = numAttr(el, name)
  return v !== undefined && Number.isFinite(v) && v > 0
    ? Math.round(v)
    : undefined
}

function exclusiveImageDisplayAttrs(el: Element): {
  displayWidth?: number
  fixedHeight?: number
  fixedWidth?: number
} {
  const displayWidth = imageDisplayWidthAttr(el)
  if (displayWidth !== undefined)
    return { displayWidth }
  const fixedWidth = imageFixedPxAttr(el, 'fixed-width')
  if (fixedWidth !== undefined)
    return { fixedWidth }
  const fixedHeight = imageFixedPxAttr(el, 'fixed-height')
  if (fixedHeight !== undefined)
    return { fixedHeight }
  return {}
}

function imageLayoutAttr(el: Element): string | undefined {
  const v = el.getAttribute('layout')
  return v !== null && IMAGE_LAYOUTS.has(v)
    ? v
    : undefined
}

/** An image's file id from `file-id`, left out when it is missing or empty. */
function fileIdOf(el: Element): { fileId: string } | Record<string, never> {
  const fileId = el.getAttribute('file-id')
  return fileId
    ? { fileId }
    : {}
}

// The gallery's types (the editor isn't a dependency of this package)
const GALLERY_ASPECTS = new Set(['auto', '1:1', '4:3', '16:9', '3:4'])
const GALLERY_FITS = new Set(['cover', 'contain'])

function galleryAspectAttr(el: Element): string {
  const v = el.getAttribute('aspect')
  return v !== null && GALLERY_ASPECTS.has(v)
    ? v
    : 'auto'
}

function galleryFitAttr(el: Element): string {
  const v = el.getAttribute('fit')
  return v !== null && GALLERY_FITS.has(v)
    ? v
    : 'cover'
}

function galleryMaxItemHeightAttr(el: Element): number | undefined {
  const v = numAttr(el, 'max-item-height')
  return v !== undefined && Number.isFinite(v) && v > 0
    ? v
    : undefined
}

/** hakulex's own: how many images a carousel shows at once, from a fixed list; 1 is left out. */
const GALLERY_PER_VIEWS = [1.2, 1.5, 2, 2.5, 3]
function galleryPerViewAttr(el: Element): { perView: number } | Record<string, never> {
  const v = numAttr(el, 'per-view')
  return v !== undefined && GALLERY_PER_VIEWS.includes(v)
    ? { perView: v }
    : {}
}

/** The content of a CDATA section in `el`, which the reader put in a `<litexml-cdata>` element. */
function extractCdataText(el: Element): string | null {
  for (const child of el.children) {
    if (child.tagName.toLowerCase() === CDATA_TAG)
      return child.textContent ?? ''
  }
  return null
}

function extractRawText(el: Element): string {
  return extractCdataText(el) ?? el.textContent ?? ''
}

export function registerCustomReaders(registry: LitexmlRegistry): void {
  // -- Pattern A: simple attributes --

  registry.registerReader('img', (el) => {
    // Standalone image block (not inside gallery)
    if (el.parentElement?.tagName.toLowerCase() === 'gallery')
      return false
    return {
      type: 'image',
      ...extractBlockId(el),
      src: el.getAttribute('src') ?? '',
      altText: el.getAttribute('alt') ?? '',
      width: numAttr(el, 'width'),
      height: numAttr(el, 'height'),
      caption: el.getAttribute('caption') ?? undefined,
      thumbhash: el.getAttribute('thumbhash') ?? undefined,
      accent: el.getAttribute('accent') ?? undefined,
      ...fileIdOf(el),
      ...exclusiveImageDisplayAttrs(el),
      layout: imageLayoutAttr(el),
      version: 1,
    } as any
  })

  registry.registerReader(
    'video',
    el =>
      ({
        type: 'video',
        ...extractBlockId(el),
        src: el.getAttribute('src') ?? '',
        poster: el.getAttribute('poster') ?? undefined,
        width: numAttr(el, 'width'),
        height: numAttr(el, 'height'),
        version: 1,
      }) as any,
  )

  registry.registerReader(
    'attachment',
    el =>
      ({
        type: 'file',
        ...extractBlockId(el),
        src: el.getAttribute('src') ?? '',
        name: el.getAttribute('name') ?? '',
        size: numAttr(el, 'size'),
        mimeType: el.getAttribute('mime-type') ?? undefined,
        ext: el.getAttribute('ext') ?? undefined,
        display: el.getAttribute('display') === 'inline'
          ? 'inline'
          : 'block',
        version: 1,
      }) as any,
  )

  registry.registerReader(
    'link-card',
    el =>
      ({
        type: 'link-card',
        ...extractBlockId(el),
        url: el.getAttribute('url') ?? '',
        source: el.getAttribute('source') ?? undefined,
        title: el.getAttribute('title') ?? undefined,
        description: el.getAttribute('description') ?? undefined,
        favicon: el.getAttribute('favicon') ?? undefined,
        image: el.getAttribute('image') ?? undefined,
        version: 1,
      }) as any,
  )

  registry.registerReader(
    'embed',
    el =>
      ({
        type: 'embed',
        ...extractBlockId(el),
        url: el.getAttribute('url') ?? '',
        source: el.getAttribute('source') ?? null,
        version: 1,
      }) as any,
  )

  // -- Pattern B: text content --

  registry.registerReader(
    'codeblock',
    el =>
      ({
        type: 'code-block',
        ...extractBlockId(el),
        code: extractRawText(el),
        language: el.getAttribute('lang') ?? '',
        version: 1,
      }) as any,
  )

  registry.registerReader(
    'mermaid',
    el =>
      ({
        type: 'mermaid',
        ...extractBlockId(el),
        diagram: extractRawText(el),
        version: 1,
      }) as any,
  )

  // math: block or inline depending on display attribute
  registry.registerReader('math', (el) => {
    const display = el.getAttribute('display')
    if (display === 'block') {
      return {
        type: 'katex-block',
        ...extractBlockId(el),
        equation: extractRawText(el),
        version: 1,
      } as any
    }
    const color = el.getAttribute('color')
    return {
      type: 'katex-inline',
      equation: extractRawText(el),
      ...(color
        ? { color }
        : {}),
      version: 1,
    } as any
  })

  // -- Pattern C: nested EditorState --

  registry.registerReader('alert', (el, ctx) => {
    const children = ctx.parseChildren(el)
    const content: SerializedEditorState = {
      root: {
        type: 'root',
        children,
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
      },
    } as SerializedEditorState
    return {
      type: 'alert-quote',
      ...extractBlockId(el),
      alertType: el.getAttribute('type') ?? 'note',
      content,
      version: 1,
    } as any
  })

  registry.registerReader('banner', (el, ctx) => {
    const children = ctx.parseChildren(el)
    const content: SerializedEditorState = {
      root: {
        type: 'root',
        children,
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
      },
    } as SerializedEditorState
    return {
      type: 'banner',
      ...extractBlockId(el),
      bannerType: el.getAttribute('type') ?? 'note',
      content,
      version: 1,
    } as any
  })

  registry.registerReader('nested-doc', (el, ctx) => {
    const children = ctx.parseChildren(el)
    const content: SerializedEditorState = {
      root: {
        type: 'root',
        children,
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
      },
    } as SerializedEditorState
    return {
      type: 'nested-doc',
      ...extractBlockId(el),
      content,
      version: 1,
    } as any
  })

  // -- Pattern D: element with children --

  registry.registerReader(
    'details',
    (el, ctx) =>
      ({
        type: 'details',
        ...extractBlockId(el),
        summary: el.getAttribute('summary') ?? '',
        open: el.getAttribute('open') === 'true',
        children: ctx.parseChildren(el),
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
      }) as any,
  )

  registry.registerReader(
    'spoiler',
    (el, ctx) =>
      ({
        type: 'spoiler',
        children: ctx.parseChildren(el),
        direction: 'ltr',
        format: '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
        version: 1,
      }) as any,
  )

  registry.registerReader(
    'ruby',
    (el, ctx) =>
      ({
        type: 'ruby',
        reading: el.getAttribute('rt') ?? '',
        children: ctx.parseChildren(el),
        direction: 'ltr',
        format: '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
        version: 1,
      }) as any,
  )

  // -- Pattern E: inline --

  registry.registerReader(
    'mention',
    el =>
      ({
        type: 'mention',
        platform: el.getAttribute('platform') ?? '',
        handle: el.getAttribute('handle') ?? '',
        displayName: el.textContent || undefined,
        version: 1,
      }) as any,
  )

  registry.registerReader(
    'tag',
    el =>
      ({
        type: 'tag',
        text: el.textContent ?? '',
        format: 0,
        detail: 0,
        mode: 'normal',
        style: '',
        version: 1,
      }) as any,
  )

  registry.registerReader(
    'comment',
    el =>
      ({
        type: 'comment',
        text: el.textContent ?? '',
        format: 0,
        detail: 0,
        mode: 'normal',
        style: '',
        version: 1,
      }) as any,
  )

  registry.registerReader(
    'footnote',
    el =>
      ({
        type: 'footnote',
        identifier: el.getAttribute('ref') ?? '',
        version: 1,
      }) as any,
  )

  registry.registerReader('footnote-section', (el) => {
    const definitions: Record<string, string> = {}
    for (const child of el.children) {
      if (child.tagName.toLowerCase() === 'def') {
        const ref = child.getAttribute('ref') ?? ''
        definitions[ref] = child.textContent ?? ''
      }
    }
    return {
      type: 'footnote-section',
      ...extractBlockId(el),
      definitions,
      version: 1,
    } as any
  })

  registry.registerReader('gallery', (el) => {
    const images: Array<{ src: string, alt?: string, fileId?: string }> = []
    for (const child of el.children) {
      if (child.tagName.toLowerCase() === 'img') {
        images.push({
          src: child.getAttribute('src') ?? '',
          alt: child.getAttribute('alt') ?? undefined,
          ...fileIdOf(child),
        })
      }
    }
    return {
      type: 'gallery',
      ...extractBlockId(el),
      images,
      layout: el.getAttribute('layout') ?? 'grid',
      aspect: galleryAspectAttr(el),
      fit: galleryFitAttr(el),
      maxItemHeight: galleryMaxItemHeightAttr(el),
      ...galleryPerViewAttr(el),
      version: 1,
    } as any
  })

  // -- Excalidraw: opaque snapshot preserved --

  registry.registerReader(
    'excalidraw',
    el =>
      ({
        type: 'excalidraw',
        ...extractBlockId(el),
        // Plain text body covers remote snapshots (a bare http/blob:/ref: URL,
        // optionally followed by a JSON delta) — see parseSnapshot in
        // rich-ext-excalidraw.
        snapshot:
          extractCdataText(el) || el.getAttribute('snapshot') || el.textContent?.trim() || '',
        version: 1,
      }) as any,
  )

  registry.registerReader(
    'chart',
    el =>
      ({
        type: 'chart',
        ...extractBlockId(el),
        spec: extractRawText(el).trim(),
        version: 1,
      }) as any,
  )

  // -- Dynamic external component: props JSON in CDATA --

  registry.registerReader('dynamic', (el) => {
    let props: Record<string, unknown> = {}
    const raw = (extractCdataText(el) ?? el.textContent ?? '').trim()
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          props = parsed
        }
      }
      catch {
        // malformed props payload degrades to empty props
      }
    }
    return {
      type: 'dynamic',
      ...extractBlockId(el),
      url: el.getAttribute('url') ?? '',
      props,
      initialHeight: numAttr(el, 'initial-height') ?? 320,
      version: 1,
    } as any
  })

  // -- Grid container: cols + gap + nested cell states --

  registry.registerReader('grid', (el, ctx) => {
    const cells: SerializedEditorState[] = []
    for (const child of el.children) {
      if (child.tagName.toLowerCase() === 'cell') {
        const children = ctx.parseChildren(child)
        cells.push({
          root: {
            type: 'root',
            children,
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
          },
        } as SerializedEditorState)
      }
    }
    return {
      type: 'grid-container',
      ...extractBlockId(el),
      cols: numAttr(el, 'cols') ?? 2,
      gap: el.getAttribute('gap') ?? '16px',
      cells,
      version: 1,
    } as any
  })

  // -- Agent diff: editing marker --

  registry.registerReader(
    'agent-diff',
    el =>
      ({
        type: 'agent-diff',
        ...extractBlockId(el),
        opType: el.getAttribute('op') ?? 'insert',
        diffEntryId: el.getAttribute('entry') ?? '',
        version: 1,
      }) as any,
  )

  registry.registerReader('code-snippet', (el) => {
    const files: Array<{ filename: string, code: string, language: string }> = []
    for (const child of el.children) {
      if (child.tagName.toLowerCase() === 'file') {
        files.push({
          filename: child.getAttribute('name') ?? '',
          code: extractRawText(child),
          language: child.getAttribute('lang') ?? '',
        })
      }
    }
    return {
      type: 'code-snippet',
      ...extractBlockId(el),
      files,
      version: 1,
    } as any
  })

  registry.registerReader('steps', (el, ctx) => {
    const steps: Array<{ id: string, title: string, content: SerializedEditorState }> = []
    for (const child of el.children) {
      if (child.tagName.toLowerCase() !== 'step')
        continue
      steps.push({
        id: child.getAttribute('id') || `s_${makeStepId()}`,
        title: child.getAttribute('title') ?? '',
        content: {
          root: {
            type: 'root',
            children: ctx.parseChildren(child),
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
          },
        } as SerializedEditorState,
      })
    }
    return {
      type: 'steps',
      ...extractBlockId(el),
      steps,
      version: 1,
    } as any
  })

  registry.registerReader('chat', (el) => {
    const variantAttr = el.getAttribute('variant')
    const variant: 'user-agent' | 'user-user'
      = variantAttr === 'user-user'
        ? 'user-user'
        : 'user-agent'

    const participants: Array<{ id: string, kind: string, name?: string, avatar?: string }> = []
    const messages: Array<{ id: string, participantId: string, content: string }> = []

    for (const child of el.children) {
      const tag = child.tagName.toLowerCase()
      if (tag === 'participants') {
        for (const p of child.children) {
          if (p.tagName.toLowerCase() !== 'participant')
            continue
          const kind = p.getAttribute('kind') === 'agent'
            ? 'agent'
            : 'user'
          participants.push({
            id: p.getAttribute('id') || `p_${makeChatParticipantId()}`,
            kind,
            name: p.getAttribute('name') || undefined,
            avatar: p.getAttribute('avatar') || undefined,
          })
        }
      }
      else if (tag === 'messages') {
        for (const m of child.children) {
          if (m.tagName.toLowerCase() !== 'message')
            continue
          messages.push({
            id: m.getAttribute('id') || `m_${makeChatMessageId()}`,
            participantId: m.getAttribute('participant') ?? '',
            content: m.textContent ?? '',
          })
        }
      }
    }

    return {
      type: 'chat',
      ...extractBlockId(el),
      variant,
      participants,
      messages,
      version: 1,
    } as any
  })

  registry.registerReader('poll', (el) => {
    let question = ''
    const options: Array<{ id: string, label: string }> = []
    for (const child of el.children) {
      const tag = child.tagName.toLowerCase()
      if (tag === 'question') {
        question = child.textContent ?? ''
      }
      else if (tag === 'option') {
        const id = child.getAttribute('id') || `o_${makeOptionIdSuffix()}`
        options.push({ id, label: child.textContent ?? '' })
      }
    }
    const modeAttr = el.getAttribute('mode')
    const mode = modeAttr === 'multiple'
      ? 'multiple'
      : 'single'
    const closeAt = el.getAttribute('close-at')
    const showResultsAttr = el.getAttribute('show-results')
    const showResults
      = showResultsAttr === 'always'
        || showResultsAttr === 'after-vote'
        || showResultsAttr === 'after-close'
        ? showResultsAttr
        : undefined
    return {
      type: 'poll',
      ...extractBlockId(el),
      pollId: el.getAttribute('poll-id') || `p_${makePollIdSuffix()}`,
      question,
      options,
      mode,
      ...(closeAt
        ? { closeAt }
        : {}),
      ...(showResults
        ? { showResults }
        : {}),
      version: 1,
    } as any
  })
}
