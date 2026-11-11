import type { CalloutType } from './callout'

/*
 * Each callout type's icon: Lucide's info, lightbulb,
 * message-square-warning, triangle-alert and octagon-alert.
 * Lucide is ISC licensed: https://lucide.dev/license.
 */

interface Shape { tag: 'path' | 'circle' | 'rect' | 'line' | 'polyline', attrs: Record<string, string> }

function path(d: string): Shape {
  return {
    tag: 'path',
    attrs: { d },
  }
}

export const CALLOUT_ICONS: Record<CalloutType, Shape[]> = {
  note: [
    {
      tag: 'circle',
      attrs: { cx: '12', cy: '12', r: '10' },
    },
    path('M12 16v-4'),
    path('M12 8h.01'),
  ],
  tip: [
    path('M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5'),
    path('M9 18h6'),
    path('M10 22h4'),
  ],
  important: [
    path('M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z'),
    path('M12 7v4'),
    path('M12 15h.01'),
  ],
  warning: [
    path('m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3'),
    path('M12 9v4'),
    path('M12 17h.01'),
  ],
  caution: [
    path('M12 16h.01'),
    path('M12 8v4'),
    path('M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z'),
  ],
}

/** The attributes of the icon's <svg>: strokes in the current color, as Lucide's. */
export const CALLOUT_ICON_ATTRS: Record<string, string> = {
  'xmlns': 'http://www.w3.org/2000/svg',
  'viewBox': '0 0 24 24',
  'fill': 'none',
  'stroke': 'currentColor',
  'stroke-width': '2',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
}

/** Lucide's chevron-right: before a collapsible block's summary, turning down as it opens. */
export const CHEVRON_RIGHT: Shape[] = [
  path('m9 18 6-6-6-6'),
]

/** Lucide's link, for a heading's anchor. */
export const LINK: Shape[] = [
  path('M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'),
  path('M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'),
]

/** Lucide's globe: a link card's icon when it has no picture of its own. */
export const GLOBE: Shape[] = [
  {
    tag: 'circle',
    attrs: { cx: '12', cy: '12', r: '10' },
  },
  path('M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20'),
  path('M2 12h20'),
]

/** Lucide's icons for what a link card's source shows, by name. */
export const LINK_CARD_ICONS = {
  'star': [
    {
      tag: 'path',
      attrs: { d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z' },
    },
  ],
  'book-text': [
    {
      tag: 'path',
      attrs: { d: 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20' },
    },
    {
      tag: 'path',
      attrs: { d: 'M8 11h8' },
    },
    {
      tag: 'path',
      attrs: { d: 'M8 7h6' },
    },
  ],
  'users': [
    {
      tag: 'path',
      attrs: { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' },
    },
    {
      tag: 'path',
      attrs: { d: 'M16 3.128a4 4 0 0 1 0 7.744' },
    },
    {
      tag: 'path',
      attrs: { d: 'M22 21v-2a4 4 0 0 0-3-3.87' },
    },
    {
      tag: 'circle',
      attrs: { cx: '9', cy: '7', r: '4' },
    },
  ],
  'git-pull-request': [
    {
      tag: 'circle',
      attrs: { cx: '18', cy: '18', r: '3' },
    },
    {
      tag: 'circle',
      attrs: { cx: '6', cy: '6', r: '3' },
    },
    {
      tag: 'path',
      attrs: { d: 'M13 6h3a2 2 0 0 1 2 2v7' },
    },
    {
      tag: 'line',
      attrs: { x1: '6', x2: '6', y1: '9', y2: '21' },
    },
  ],
  'git-merge': [
    {
      tag: 'circle',
      attrs: { cx: '18', cy: '18', r: '3' },
    },
    {
      tag: 'circle',
      attrs: { cx: '6', cy: '6', r: '3' },
    },
    {
      tag: 'path',
      attrs: { d: 'M6 21V9a9 9 0 0 0 9 9' },
    },
  ],
  'git-pull-request-closed': [
    {
      tag: 'path',
      attrs: { d: 'm15.5 3.5 5 5' },
    },
    {
      tag: 'path',
      attrs: { d: 'm15.5 8.5 5-5' },
    },
    {
      tag: 'path',
      attrs: { d: 'M18 11.62V15' },
    },
    {
      tag: 'path',
      attrs: { d: 'M6 9v12' },
    },
    {
      tag: 'circle',
      attrs: { cx: '18', cy: '18', r: '3' },
    },
    {
      tag: 'circle',
      attrs: { cx: '6', cy: '6', r: '3' },
    },
  ],
  'circle-dot': [
    {
      tag: 'circle',
      attrs: { cx: '12', cy: '12', r: '1' },
    },
    {
      tag: 'circle',
      attrs: { cx: '12', cy: '12', r: '10' },
    },
  ],
  'circle-check': [
    {
      tag: 'circle',
      attrs: { cx: '12', cy: '12', r: '10' },
    },
    {
      tag: 'path',
      attrs: { d: 'm16 9-5.5 5.5L8 12' },
    },
  ],
  'git-commit-horizontal': [
    {
      tag: 'circle',
      attrs: { cx: '12', cy: '12', r: '3' },
    },
    {
      tag: 'line',
      attrs: { x1: '3', x2: '9', y1: '12', y2: '12' },
    },
    {
      tag: 'line',
      attrs: {
        x1: '15',
        x2: '21',
        y1: '12',
        y2: '12',
      },
    },
  ],
  'messages-square': [
    {
      tag: 'path',
      attrs: { d: 'M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z' },
    },
    {
      tag: 'path',
      attrs: { d: 'M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1' },
    },
  ],
  'unlink': [
    {
      tag: 'path',
      attrs: { d: 'm18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71' },
    },
    {
      tag: 'path',
      attrs: { d: 'm5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71' },
    },
    {
      tag: 'line',
      attrs: { x1: '8', x2: '8', y1: '2', y2: '5' },
    },
    {
      tag: 'line',
      attrs: { x1: '2', x2: '5', y1: '8', y2: '8' },
    },
    {
      tag: 'line',
      attrs: {
        x1: '16',
        x2: '16',
        y1: '19',
        y2: '22',
      },
    },
    {
      tag: 'line',
      attrs: {
        x1: '19',
        x2: '22',
        y1: '16',
        y2: '16',
      },
    },
  ],
} satisfies Record<string, Shape[]>
