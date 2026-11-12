import type { LitexmlRegistry } from '@hakulex/litexml'
import type { AgentDocument, Block, DocumentXmlOptions } from './types'
import { createDefaultRegistry, serializeNodesToXml, serializeToXml } from '@hakulex/litexml'
import { blocksOf, idOf, withBlocks } from './blocks'
import { proposedBlocks } from './state'

let shared: LitexmlRegistry | undefined
export const registryOf = (registry?: LitexmlRegistry) => registry ?? (shared ??= createDefaultRegistry())

/**
 * A block of a kind LiteXML has no writer for goes out as a bare marker: the model can see that
 * something is there and remove it, but not read or rewrite data the editor itself doesn't know.
 */
function opaque(block: Block, registry: LitexmlRegistry): Block {
  if (registry.getWriter(block.type))
    return block
  const id = idOf(block)
  return {
    type: block.type,
    version: 1,
    ...(id
      ? {
          $: { blockId: id },
        }
      : {}),
  } as Block
}

const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/** One block as LiteXML, for telling the model what is there. */
export function blockToXml(block: Block, registry?: LitexmlRegistry): string {
  const used = registryOf(registry)
  return serializeNodesToXml([
    opaque(block, used),
  ], used).trim()
}

/** The document as the LiteXML a model reads: every top-level block carries its ID. */
export function documentToXml(document: AgentDocument, options: DocumentXmlOptions = {}): string {
  const registry = registryOf(options.registry)
  const blocks = options.proposal
    ? proposedBlocks(document, options.proposal)
    : blocksOf(document)
  const selection = options.selection
  const xml = serializeToXml(withBlocks(document, blocks.map(block => opaque(block, registry))), registry, {
    selectedBlockIds: selection && 'blockIds' in selection
      ? new Set(selection.blockIds)
      : undefined,
  })
  if (!selection || !('text' in selection))
    return xml
  return `${xml.trimEnd()}\n<selection block="${escape(selection.blockId).replaceAll('"', '&quot;')}">${escape(selection.text)}</selection>\n`
}
