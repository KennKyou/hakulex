import type { LitexmlRegistry } from './registry'
import { HTML_VOID_ELEMENTS } from './deserializer'
import { isFormatTag } from './text-format'

export interface XmlProblem {
  /** `malformed`: the markup itself is broken. `unknown-tag`: a tag LiteXML has no meaning for. `empty`: nothing to read. */
  kind: 'malformed' | 'unknown-tag' | 'empty'
  /** One sentence, written so that whoever produced the XML can fix it. */
  message: string
  /** The tag the problem is about, in lower case. */
  tag?: string
  /** Where in the text the problem starts. */
  index: number
}

export interface CheckXmlOptions {
  /** Tags that a reader of your own handles inside its element, which the registry can't know about. */
  knownTags?: Iterable<string>
}

/** Tags LiteXML's own readers take care of inside their elements, without a reader of their own. */
const INNER_TAGS = [
  'doc',
  'br',
  'node',
  'cell',
  'step',
  'file',
  'participants',
  'participant',
  'messages',
  'message',
  'question',
  'option',
  'def',
]

const CDATA_OPEN = '<![CDATA['
const NAME = /^[a-z][\w:.-]*/i
const ATTRIBUTE_NAME = /^[^\s=/>"'<]+/

/**
 * Says what is wrong with a piece of LiteXML, strictly: `deserializeFromXml` and
 * `deserializeNodesFromXml` read whatever they can and never complain, which suits pasting but
 * not checking what a program or a model wrote. An empty list means nothing was found.
 */
export function checkXml(xml: string, registry: LitexmlRegistry, options: CheckXmlOptions = {}): XmlProblem[] {
  const problems: XmlProblem[] = []
  const known = new Set([
    ...INNER_TAGS,
    ...options.knownTags ?? [],
  ].map(tag => tag.toLowerCase()))
  const reported = new Set<string>()
  const open: { tag: string, index: number }[] = []
  let sawContent = false

  const malformed = (message: string, index: number, tag?: string) => problems.push({
    kind: 'malformed',
    message,
    index,
    ...(tag
      ? { tag }
      : {}),
  })
  const neverClosed = (entry: { tag: string, index: number }) =>
    malformed(`<${entry.tag}> is never closed. Add </${entry.tag}>.`, entry.index, entry.tag)

  let at = 0
  while (at < xml.length) {
    const start = xml.indexOf('<', at)
    if (xml.slice(at, start < 0
      ? xml.length
      : start).trim()) {
      sawContent = true
    }
    if (start < 0)
      break

    if (xml.startsWith(CDATA_OPEN, start)) {
      const end = xml.indexOf(']]>', start)
      sawContent = true
      if (end < 0) {
        malformed('A <![CDATA[ section is never closed. End it with ]]>.', start)
        return problems
      }
      at = end + 3
      continue
    }
    if (xml.startsWith('<!--', start)) {
      const end = xml.indexOf('-->', start)
      if (end < 0) {
        malformed('A <!-- comment is never closed. End it with -->.', start)
        return problems
      }
      at = end + 3
      continue
    }

    const closing = xml[start + 1] === '/'
    const nameAt = start + (closing ? 2 : 1)
    const name = NAME.exec(xml.slice(nameAt))?.[0]
    if (!name) {
      malformed('A < in text has to be written as &lt;.', start)
      sawContent = true
      at = start + 1
      continue
    }
    const tag = name.toLowerCase()
    sawContent = true
    let cursor = nameAt + name.length

    if (closing) {
      const end = xml.indexOf('>', cursor)
      if (end < 0 || xml.slice(cursor, end).trim()) {
        malformed(`The closing tag </${tag} is not finished. Write </${tag}>.`, start, tag)
        return problems
      }
      const match = open.map(entry => entry.tag).lastIndexOf(tag)
      if (match < 0) {
        malformed(`</${tag}> closes a tag that was never opened.`, start, tag)
      }
      else {
        // Whatever was opened after it and is still open was left unclosed.
        for (const entry of open.splice(match + 1).reverse())
          neverClosed(entry)
        open.pop()
      }
      at = end + 1
      continue
    }

    // Attributes, up to the end of the tag.
    let selfClosing = false
    let finished = false
    while (cursor < xml.length) {
      const rest = xml.slice(cursor)
      const space = /^\s+/.exec(rest)?.[0]
      if (space) {
        cursor += space.length
        continue
      }
      if (rest.startsWith('/>')) {
        selfClosing = true
        finished = true
        cursor += 2
        break
      }
      if (rest[0] === '>') {
        finished = true
        cursor += 1
        break
      }
      const attribute = ATTRIBUTE_NAME.exec(rest)?.[0]
      if (!attribute) {
        malformed(`<${tag}> has something that is not an attribute. Attributes are written name="value".`, start, tag)
        return problems
      }
      cursor += attribute.length
      const equals = /^\s*=\s*/.exec(xml.slice(cursor))?.[0]
      if (!equals)
        continue
      cursor += equals.length
      const quote = xml[cursor]
      if (quote !== '"' && quote !== '\'') {
        malformed(`The value of ${attribute} in <${tag}> has no quotes. Write ${attribute}="…".`, start, tag)
        return problems
      }
      const end = xml.indexOf(quote, cursor + 1)
      // A quote that swallows the rest of the tag and the start of the next one was never closed.
      if (end < 0 || xml.slice(cursor + 1, end).includes('<')) {
        malformed(`The value of ${attribute} in <${tag}> has a quote that is never closed, or a < inside it (write &lt;).`, start, tag)
        return problems
      }
      cursor = end + 1
    }
    if (!finished) {
      malformed(`The tag <${tag} is not finished. End it with > or />.`, start, tag)
      return problems
    }

    if (!known.has(tag) && !isFormatTag(tag) && !registry.getReader(tag) && !reported.has(tag)) {
      reported.add(tag)
      problems.push({
        kind: 'unknown-tag',
        message: `<${tag}> is not a LiteXML tag.`,
        tag,
        index: start,
      })
    }
    if (!selfClosing && !HTML_VOID_ELEMENTS.has(tag))
      open.push({ tag, index: start })
    at = cursor
  }

  for (const entry of open.reverse())
    neverClosed(entry)
  if (!sawContent)
    problems.push({ kind: 'empty', message: 'There is nothing here: no tags and no text.', index: 0 })
  return problems
}
