import type { VueDecorator } from '@hakulex/vue-lexical'
import type {
  DOMConversionMap,
  DOMExportOutput,
  LexicalNode,
  SerializedLexicalNode,
} from 'lexical'
import { vueDecorator } from '@hakulex/vue-lexical'
import { $applyNodeReplacement, createCommand, DecoratorNode } from 'lexical'
import HorizontalRule from '../components/HorizontalRule.vue'

export type SerializedHorizontalRuleNode = SerializedLexicalNode

export const INSERT_HORIZONTAL_RULE_COMMAND = createCommand<void>('INSERT_HORIZONTAL_RULE_COMMAND')

/**
 * A divider. Serializes as `horizontalrule`, the same type as Lexical's own
 * node, so documents stay interchangeable with other Lexical editors.
 */
export class HorizontalRuleNode extends DecoratorNode<VueDecorator> {
  static getType(): string {
    return 'horizontalrule'
  }

  static clone(node: HorizontalRuleNode): HorizontalRuleNode {
    return new HorizontalRuleNode(node.__key)
  }

  static importJSON(serialized: SerializedHorizontalRuleNode): HorizontalRuleNode {
    return $createHorizontalRuleNode().updateFromJSON(serialized)
  }

  static importDOM(): DOMConversionMap {
    return {
      hr: () => ({
        conversion: () => ({
          node: $createHorizontalRuleNode(),
        }),
        priority: 0,
      }),
    }
  }

  exportDOM(): DOMExportOutput {
    return {
      element: document.createElement('hr'),
    }
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div')
    div.className = 'hlx-hr-block'
    return div
  }

  updateDOM(): false {
    return false
  }

  getTextContent(): string {
    return '\n'
  }

  isInline(): false {
    return false
  }

  decorate(): VueDecorator {
    return vueDecorator(HorizontalRule, this.__key)
  }
}

export function $createHorizontalRuleNode(): HorizontalRuleNode {
  return $applyNodeReplacement(new HorizontalRuleNode())
}

export function $isHorizontalRuleNode(node: LexicalNode | null | undefined): node is HorizontalRuleNode {
  return node instanceof HorizontalRuleNode
}
