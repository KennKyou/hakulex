import type { FunctionalComponent } from 'vue'
import { h } from 'vue'

/** A 16-unit line icon drawn in the text's color; it says nothing to screen readers. */
function icon(paths: string[]): FunctionalComponent {
  return () => h('svg', {
    'viewBox': '0 0 16 16',
    'width': 14,
    'height': 14,
    'fill': 'none',
    'stroke': 'currentColor',
    'stroke-width': 1.4,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    'focusable': 'false',
  }, paths.map(d => h('path', { d })))
}

export const IconSliders = icon(['M2 4.5h6M11 4.5h3M2 11.5h2M7 11.5h7M9.5 3v3M5.5 10v3'])
export const IconTable = icon(['M2.5 3.5h11v9h-11zM2.5 6.5h11M6.5 6.5v6'])
export const IconChart = icon(['M3 13V8M6.5 13V4M10 13V9.5M13.5 13V6'])
export const IconCode = icon(['M6 4.5 2.5 8 6 11.5M10 4.5 13.5 8 10 11.5'])
export const IconPlus = icon(['M8 3.5v9M3.5 8h9'])
export const IconClose = icon(['M4.5 4.5l7 7M11.5 4.5l-7 7'])
export const IconCopy = icon(['M5.5 5.5h7v7h-7zM3.5 10.5v-7h7'])
