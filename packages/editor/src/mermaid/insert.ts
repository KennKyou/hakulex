import type { ElementNode } from 'lexical'
import { $createParagraphNode, $getEditor, $setSelection } from 'lexical'
import { $createMermaidNode } from '../nodes/MermaidNode'
import { mermaidEditChannel } from './edit'

/**
 * Puts a diagram where `block` is; the block becomes the empty paragraph after
 * it, for the caret once editing is done. An empty diagram opens its editor.
 */
export function $replaceWithMermaid(block: ElementNode, diagram: string): void {
  const node = $createMermaidNode(diagram)
  block.insertBefore(node)
  block.replace($createParagraphNode())
  $setSelection(null)
  if (!diagram)
    mermaidEditChannel.request($getEditor(), node.getKey(), undefined)
}
