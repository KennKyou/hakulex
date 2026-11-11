import type { LinkCardProvider } from './types'

/*
 * arXiv papers: the paper's Atom
 * entry from export.arxiv.org, for its title and authors. It is XML, so it is fetched as text,
 * through the `arxiv` adapter when the site gives one.
 */

export const arxivProvider: LinkCardProvider = {
  name: 'arxiv',
  displayName: 'arXiv Paper',
  priority: 80,
  shape: 'expanded',
  provider: 'arxiv',
  matchUrl(url) {
    if (url.hostname !== 'arxiv.org')
      return null
    const match = url.pathname.match(/\/(?:abs|pdf)\/(\d{4}\.\d+(?:v\d+)?)/i)
    if (!match)
      return null
    return {
      id: match[1]!.toLowerCase(),
      fullUrl: url.toString(),
    }
  },
  isValidId: id => /^\d{4}\.\d+(?:v\d+)?$/.test(id),
  async fetch(id, context) {
    const url = `https://export.arxiv.org/api/query?id_list=${id}`
    const adapter = context?.adapters?.arxiv
    let xml: string
    if (adapter) {
      xml = await adapter.request<string>(url)
    }
    else {
      const response = await fetch(url)
      if (!response.ok)
        throw new Error(`Request failed: ${response.status}`)
      xml = await response.text()
    }
    const entry = new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('entry')[0]
    if (!entry)
      throw new Error('No such paper.')
    const title = entry.getElementsByTagName('title')[0]?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    const authors = Array.from(entry.getElementsByTagName('author'), author => author.getElementsByTagName('name')[0]?.textContent?.trim() ?? '').filter(Boolean)
    return {
      title,
      badge: {
        text: id,
        icon: 'book-text',
        color: '#a3a3a3',
        mono: true,
      },
      description: authors.length
        ? [
            {
              text: authors.length > 1
                ? `${authors[0]} et al.`
                : authors[0],
              icon: 'users',
            },
          ]
        : undefined,
    }
  },
}
