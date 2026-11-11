import type { LexicalNode, RangeSelection, TextFormatType } from 'lexical'
import { $canApplyRuby, $isSelectionInSpoiler, $rubyOfSelection } from '@hakulex/editor'
import { $isAutoLinkNode, $isLinkNode } from '@lexical/link'
import { $findMatchingParent } from '@lexical/utils'
import { $isTextNode } from 'lexical'

export const TOOLBAR_FORMATS = [
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'code',
  'superscript',
  'subscript',
] as const
export type ToolbarFormat = (typeof TOOLBAR_FORMATS)[number] & TextFormatType

export interface ToolbarState {
  formats: Record<ToolbarFormat, boolean>
  /** True when any selected text sits inside a link. */
  hasLink: boolean
  /** URL of the link around the selection anchor, for prefilling the editor. */
  linkUrl: string
  /** True when all the selected text is in spoilers. */
  inSpoiler: boolean
  /** True when the whole selection is inside one ruby. */
  hasRuby: boolean
  /** The reading of that ruby, for prefilling the editor. */
  rubyReading: string
  canApplyRuby: boolean
}

/** An unlinked autolink is plain text to the author, even though the node remains. */
const $linkAncestor = (node: LexicalNode) => $findMatchingParent(node, parent => $isLinkNode(parent) && !($isAutoLinkNode(parent) && parent.getIsUnlinked()))

export function $getToolbarState(selection: RangeSelection): ToolbarState {
  const formats = Object.fromEntries(
    TOOLBAR_FORMATS.map(format => [
      format,
      selection.hasFormat(format),
    ]),
  ) as Record<ToolbarFormat, boolean>

  const anchorLink = $linkAncestor(selection.anchor.getNode())
  const ruby = $rubyOfSelection(selection)
  return {
    formats,
    hasLink: selection.getNodes().some(node => $linkAncestor(node) !== null),
    linkUrl: $isLinkNode(anchorLink)
      ? anchorLink.getURL()
      : '',
    inSpoiler: $isSelectionInSpoiler(selection),
    hasRuby: ruby !== null,
    rubyReading: ruby?.getReading() ?? '',
    canApplyRuby: $canApplyRuby(selection),
  }
}

/** Drops text formats and inline styles from the selection. Links are not formats, so they stay. */
export function $clearFormatting(selection: RangeSelection) {
  for (const node of selection.extract()) {
    if ($isTextNode(node)) {
      node.setFormat(0)
      node.setStyle('')
    }
  }
  selection.setFormat(0)
  selection.setStyle('')
}

/**
 * Turns what people type into a link target:
 * keeps explicit schemes, `a@b.c` → `mailto:`, anything else gets `https://`.
 */
export function normalizeUrl(input: string): string {
  const value = input.trim()
  if (!value)
    return ''
  if (/^[a-z][a-z\d+\-.]*:/i.test(value))
    return value
  if (/^[^\s@/]+@[^\s/@][^\s./@]*\.[^\s/@]+$/.test(value))
    return `mailto:${value}`
  return `https://${value.replace(/^\/+/, '')}`
}
