import type { ElementNode } from 'lexical'
import { $createParagraphNode, $getEditor, $setSelection } from 'lexical'
import { $createKaTeXBlockNode } from '../nodes/MathNodes'
import { mathEditChannel } from './edit'

/**
 * Puts a block equation where `block` is. The block becomes the (empty)
 * paragraph after it, so the caret has somewhere to land once editing is done.
 * An empty equation opens its editor.
 */
export function $replaceWithMathBlock(block: ElementNode, equation: string): void {
  const node = $createKaTeXBlockNode(equation)
  block.insertBefore(node)
  block.replace($createParagraphNode())
  $setSelection(null)
  if (!equation)
    mathEditChannel.request($getEditor(), node.getKey(), undefined)
}
