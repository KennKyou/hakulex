import type { MultilineElementTransformer, Transformer } from '@lexical/markdown'
import type { ElementNode } from 'lexical'
import { CALLOUT_TYPES, normalizeCalloutType } from '@hakulex/renderer'
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown'
import {
  $createAlertNode,
  $createBannerNode,
  $createDetailsNode,
  $isAlertNode,
  $isBannerNode,
  $isDetailsNode,
  AlertNode,
  BannerNode,
  DetailsNode,
} from '../nodes/CalloutNodes'

const ALERT_START = /^>\s*\[!(\w+)\]\s*$/
const ALERT_LINE = /^>\s?(.*)$/
const CONTAINER_START = /^:::\s*(\w+)(?:\{(.*)\})?\s*$/
const CONTAINER_END = /^:::\s*$/
const FENCE = /^\s*`{3,}/
const SUMMARY = /summary="((?:[^"\\]|\\.)*)"/

const unescapeSummary = (summary: string) => summary.replace(/\\(["\\])/g, '$1')
const escapeSummary = (summary: string) => summary.replace(/\s+/g, ' ').replace(/["\\]/g, '\\$&')

/** The line closing the container opened at `start`, past nested ones and code fences. */
function findContainerEnd(lines: string[], start: number): number {
  let depth = 1
  let inFence = false
  for (let i = start + 1; i < lines.length; i++) {
    if (FENCE.test(lines[i]))
      inFence = !inFence
    if (inFence)
      continue
    if (CONTAINER_END.test(lines[i]))
      depth--
    else if (CONTAINER_START.test(lines[i]))
      depth++
    if (!depth)
      return i
  }
  return -1
}

/** `getTransformers` is lazy because blocks hold any content, these blocks included. */
export function createCalloutTransformers(getTransformers: () => Transformer[]): MultilineElementTransformer[] {
  const fill = (node: ElementNode, markdown: string) => {
    $convertFromMarkdownString(markdown, getTransformers(), node)
    return node
  }
  const exportBody = (node: ElementNode) => $convertToMarkdownString(getTransformers(), node)

  const ALERT: MultilineElementTransformer = {
    type: 'multiline-element',
    dependencies: [AlertNode],
    regExpStart: ALERT_START,
    regExpEnd: { optional: true, regExp: ALERT_LINE },
    // Only for import: typing the syntax stays a quote.
    replace: () => false,
    handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex, startMatch }) => {
      const type = startMatch[1].toLowerCase()
      if (!CALLOUT_TYPES.includes(type as never))
        return null
      const body: string[] = []
      let end = startLineIndex
      while (end + 1 < lines.length) {
        const line = ALERT_LINE.exec(lines[end + 1])
        if (!line)
          break
        body.push(line[1])
        end++
      }
      rootNode.append(fill($createAlertNode(type), body.join('\n')))
      return [true, end]
    },
    export: (node) => {
      if (!$isAlertNode(node))
        return null
      const body = exportBody(node).split('\n').map(line => line
        ? `> ${line}`
        : '>')
      return [`> [!${node.getCalloutType().toUpperCase()}]`, ...body].join('\n')
    },
  }

  const CONTAINER: MultilineElementTransformer = {
    type: 'multiline-element',
    dependencies: [BannerNode, DetailsNode],
    regExpStart: CONTAINER_START,
    regExpEnd: { optional: true, regExp: CONTAINER_END },
    replace: () => false,
    handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex, startMatch }) => {
      const name = startMatch[1].toLowerCase()
      const bannerType = normalizeCalloutType(name)
      if (name !== 'details' && !bannerType)
        return null
      const end = findContainerEnd(lines, startLineIndex)
      if (end < 0)
        return null
      const body = lines.slice(startLineIndex + 1, end).join('\n')
      const summary = SUMMARY.exec(startMatch[2] ?? '')?.[1]
      rootNode.append(fill(
        name === 'details'
          ? $createDetailsNode(unescapeSummary(summary ?? ''))
          : $createBannerNode(bannerType),
        body,
      ))
      return [true, end]
    },
    export: (node) => {
      if ($isBannerNode(node))
        return `::: ${node.getCalloutType()}\n${exportBody(node)}\n:::`
      if ($isDetailsNode(node))
        return `::: details{summary="${escapeSummary(node.getSummary())}"}\n${exportBody(node)}\n:::`
      return null
    },
  }

  return [ALERT, CONTAINER]
}
