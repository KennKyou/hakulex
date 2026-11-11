type ParseHTMLFn = (html: string) => Document

let impl: ParseHTMLFn | null = null

export function registerParseHTML(fn: ParseHTMLFn): void {
  impl = fn
}

export function parseHTML(html: string): Document {
  if (!impl) {
    throw new Error(
      '@hakulex/litexml: parseHTML implementation not registered. Import from the main entry (@hakulex/litexml), not a deep submodule path.',
    )
  }
  return impl(html)
}
