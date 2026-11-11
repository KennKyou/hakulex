import type { ColorScheme, ThemeTokens } from '@hakulex/style-token'

/*
 * Accent colors a site might bring, for showing the `theme` option. The default accent is
 * blue, so none here is; each has a lighter version for dark pages. Shared by the home page
 * and the editor page.
 */
export interface Accent {
  id: string
  label: string
  light: string
  dark: string
}

export const ACCENTS: Accent[] = [
  {
    id: 'green',
    label: '綠',
    light: '#16a34a',
    dark: '#4ade80',
  },
  {
    id: 'pink',
    label: '粉紅',
    light: '#db2777',
    dark: '#f472b6',
  },
  {
    id: 'amber',
    label: '琥珀',
    light: '#d97706',
    dark: '#fbbf24',
  },
  {
    id: 'violet',
    label: '紫',
    light: '#7c3aed',
    dark: '#a78bfa',
  },
  {
    id: 'ink',
    label: '墨',
    light: '#171717',
    dark: '#e5e5e5',
  },
]

/** The tokens one accent sets: the accent, links, its tint and quote bars. Nothing for none. */
export function accentTheme(color: string | undefined): ThemeTokens | undefined {
  return color
    ? {
        color: {
          accent: color,
          link: color,
          accentLight: `${color}33`,
          quoteBorder: color,
        },
      }
    : undefined
}

/** A listed accent in the page's scheme. */
export function accentColor(id: string, scheme: ColorScheme): string | undefined {
  return ACCENTS.find(accent => accent.id === id)?.[scheme]
}
