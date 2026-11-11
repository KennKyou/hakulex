import { TextNode } from 'lexical'

export class BadgeNode extends TextNode {
  static getType() {
    return 'test-badge'
  }

  static clone(node: BadgeNode) {
    return new BadgeNode(node.__text, node.__key)
  }
}
