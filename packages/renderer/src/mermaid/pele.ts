import type { RenderOptions } from 'pele'

type Pele = typeof import('pele/lazy')

let pele: Promise<Pele> | null = null

/** Loads pele's core; each diagram type's code loads on first use. Works on the server. */
export function loadPele(): Promise<Pele> {
  pele ??= import('pele/lazy')
  return pele
}

/** Short stable hash, so the same source gets the same SVG ids on server and client. */
function hash(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++)
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0
  return h.toString(36)
}

const OPTIONS: RenderOptions = {
  // Stored content is untrusted: no links or external images in diagrams.
  links: false,
  images: false,
  responsive: true,
  // A class with no members is just its name, not a name over two empty boxes.
  config: {
    class: { hideEmptyMembersBox: true },
  },
}

/**
 * The fonts a diagram's text is measured in. Colors and the fonts drawn come from --pele-*
 * variables in content.css, but sizes are measured when rendering: in a browser with a canvas,
 * which can't read CSS variables, so these are the font lists themselves.
 */
export interface DiagramFonts {
  sans?: string
  mono?: string
}

/** The fonts in effect on an element, from the --hlx-font-* tokens. */
export function diagramFonts(element: Element): DiagramFonts {
  const style = getComputedStyle(element)
  return {
    sans: style.getPropertyValue('--hlx-font-sans').trim() || undefined,
    mono: style.getPropertyValue('--hlx-font-mono').trim() || undefined,
  }
}

export type DiagramResult = { svg: string } | { error: string }

/** Renders Mermaid source to SVG with pele. Never throws. */
export async function renderDiagram(source: string, fonts: DiagramFonts = {}): Promise<DiagramResult> {
  try {
    const { renderAsync } = await loadPele()
    // pele's own ids (title, desc, gradients) default to a shared "pele" prefix,
    // which collides between diagrams. A prefix from the source is unique per
    // diagram and identical on server and client.
    const { svg } = await renderAsync(source, {
      ...OPTIONS,
      fontFamily: fonts.sans ?? 'sans-serif',
      fontFamilyMono: fonts.mono ?? 'monospace',
      idPrefix: `hlx-mmd-${hash(source)}`,
    })
    return { svg }
  }
  catch (error) {
    return {
      error: error instanceof Error
        ? error.message
        : String(error),
    }
  }
}

/**
 * Rough rendered height from the source, so the placeholder reserves about the
 * right space and the page doesn't jump when the diagram arrives.
 */
export function estimateDiagramHeight(source: string): number {
  const lines = source.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('%%'))
  const kind = (lines[0] ?? '').toLowerCase()
  const perLine
    = kind.startsWith('sequencediagram')
      ? 50
      : kind.startsWith('gantt')
        ? 36
        : /^(?:flowchart|graph) (?:lr|rl)/.test(kind)
          ? 30
          : 55
  const height = kind.startsWith('pie')
    ? 320
    : lines.length * perLine + 80
  return Math.min(Math.max(Math.round(height), 160), 720)
}
