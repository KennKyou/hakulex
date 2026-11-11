import type { ElementTransformer } from '@lexical/markdown'
import { isSafeImageSrc } from '@hakulex/renderer'
import { $isTextNode } from 'lexical'
import { $createImageNode, $isImageNode, ImageNode } from '../nodes/ImageNode'

const escapeAlt = (alt: string) => alt.replace(/[\\[\]]/g, '\\$&')
const unescapeAlt = (alt: string) => alt.replace(/\\([\\[\]])/g, '$1')
// Keeps the destination one token: spaces and parentheses would end it early.
const escapeTitle = (title: string) => title.replace(/\s+/g, ' ').replace(/["\\]/g, '\\$&')
const unescapeTitle = (title: string) => title.replace(/\\(["\\])/g, '$1')
const encodeSrc = (src: string) => src.replace(/[\s()]/g, char => encodeURIComponent(char).replace('(', '%28').replace(')', '%29'))

/**
 * `![alt](src "caption")` alone on a line, for import and export. Not converted while
 * typing: Lexical's LINK transformer fires first on the closing parenthesis.
 */
export const IMAGE: ElementTransformer = {
  type: 'element',
  dependencies: [ImageNode],
  export: (node) => {
    if (!$isImageNode(node))
      return null
    const { src, altText, caption } = node.getData()
    if (!isSafeImageSrc(src))
      return null
    const title = caption
      ? ` "${escapeTitle(caption)}"`
      : ''
    return `![${escapeAlt(altText)}](${encodeSrc(src)}${title})`
  },
  regExp: /^!\[((?:[^\]\\]|\\.)*)\]\(([^\s()]*(?:\([^\s()]*\)[^\s()]*)*)(?:\s+"((?:[^"\\]|\\.)*)")?\)\s*$/,
  replace: (parentNode, children, match, isImport) => {
    if (!isImport)
      return false
    if (!isSafeImageSrc(match[2])) {
      // On import Lexical has already cut the match from the text, and returning
      // false wouldn't restore it. Put the source back so nothing is lost.
      const [text] = children
      if ($isTextNode(text))
        text.setTextContent(match[0])
      return
    }
    parentNode.replace($createImageNode({
      src: match[2],
      altText: unescapeAlt(match[1]),
      caption: match[3] && unescapeTitle(match[3]),
    }))
  },
}
