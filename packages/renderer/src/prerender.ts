import type { InjectionKey } from 'vue'
import type { SerializedDocument, SerializedNode } from './types'
import { loadKatex, mathKey, renderMathToString } from './math/katex'
import { renderDiagram } from './mermaid/pele'
import { nestedRoots } from './steps'

/**
 * Output of heavy blocks rendered ahead of time. Plain data: serialize it into
 * your SSR payload so the client hydrates against the same markup.
 */
export interface Prerendered {
  /** `mathKey(equation, displayMode)` → KaTeX HTML. */
  math?: Record<string, string>
  /** Mermaid source → SVG. Sources that fail to render are left out. */
  diagrams?: Record<string, string>
}

/** Provided by `<RichRenderer>` as a getter so a changed prop reaches mounted views. */
export const PrerenderedKey: InjectionKey<() => Prerendered | undefined> = Symbol('Prerendered')

/**
 * Renders every equation (KaTeX) and diagram (pele) in `doc` ahead of time.
 * Pass the result to `<RichRenderer :prerendered>` on both server and client
 * (e.g. through Nuxt's `useAsyncData`): the SSR HTML then contains typeset
 * math and diagrams, and hydration matches. Include `katex/dist/katex.min.css`
 * on such pages yourself, since it's needed for the first paint.
 */
export async function prerenderDocument(doc: SerializedDocument): Promise<Prerendered> {
  const equations = new Map<string, [string, boolean]>()
  const sources = new Set<string>()
  const walk = (node: SerializedNode) => {
    if ((node.type === 'katex-inline' || node.type === 'katex-block') && typeof node.equation === 'string') {
      const displayMode = node.type === 'katex-block'
      equations.set(mathKey(node.equation, displayMode), [node.equation, displayMode])
    }
    if (node.type === 'mermaid' && typeof node.diagram === 'string' && node.diagram.trim())
      sources.add(node.diagram)
    node.children?.forEach(walk)
    nestedRoots(node).forEach(walk)
  }
  walk(doc.root)

  const result: Prerendered = {}
  if (equations.size) {
    const katex = await loadKatex()
    result.math = {}
    for (const [key, [equation, displayMode]] of equations)
      result.math[key] = renderMathToString(katex, equation, displayMode)
  }
  if (sources.size) {
    result.diagrams = {}
    for (const source of sources) {
      const rendered = await renderDiagram(source)
      if ('svg' in rendered)
        result.diagrams[source] = rendered.svg
    }
  }
  return result
}
