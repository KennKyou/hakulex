/*
 * The tokens: one table for the CSS
 * in tokens.css, the tests, and themeStyle.
 */

export type EditorVariantName = 'article' | 'note' | 'comment' | 'chat'

/** Every token, by group and name, to its CSS variable. */
export const TOKEN_GROUPS = {
  color: {
    text: '--hlx-color-text',
    textSecondary: '--hlx-color-text-secondary',
    textTertiary: '--hlx-color-text-tertiary',
    textQuaternary: '--hlx-color-text-quaternary',
    bg: '--hlx-color-bg',
    bgSecondary: '--hlx-color-bg-secondary',
    bgTertiary: '--hlx-color-bg-tertiary',
    bgElevated: '--hlx-color-bg-elevated',
    fill: '--hlx-color-fill',
    fillSecondary: '--hlx-color-fill-secondary',
    fillTertiary: '--hlx-color-fill-tertiary',
    fillQuaternary: '--hlx-color-fill-quaternary',
    border: '--hlx-color-border',
    borderSubtle: '--hlx-color-border-subtle',
    ring: '--hlx-color-ring',
    scrim: '--hlx-color-scrim',
    accent: '--hlx-color-accent',
    accentLight: '--hlx-color-accent-light',
    link: '--hlx-color-link',
    codeText: '--hlx-color-code-text',
    codeBg: '--hlx-color-code-bg',
    codeHeaderBg: '--hlx-color-code-header-bg',
    hrBorder: '--hlx-color-hr-border',
    quoteBorder: '--hlx-color-quote-border',
    quoteBg: '--hlx-color-quote-bg',
    alertInfo: '--hlx-color-alert-info',
    alertWarning: '--hlx-color-alert-warning',
    alertTip: '--hlx-color-alert-tip',
    alertCaution: '--hlx-color-alert-caution',
    alertImportant: '--hlx-color-alert-important',
  },
  space: {
    xs: '--hlx-space-xs',
    sm: '--hlx-space-sm',
    md: '--hlx-space-md',
    lg: '--hlx-space-lg',
    xl: '--hlx-space-xl',
  },
  flow: {
    paragraph: '--hlx-flow-paragraph',
    list: '--hlx-flow-list',
    block: '--hlx-flow-block',
    heading: '--hlx-flow-heading',
  },
  typography: {
    fontFamily: '--hlx-font-family',
    fontFamilySans: '--hlx-font-family-sans',
    fontFamilySerif: '--hlx-font-family-serif',
    fontFamilyKai: '--hlx-font-family-kai',
    fontMono: '--hlx-font-mono',
    fontSize2xs: '--hlx-font-size-2xs',
    fontSizeXs: '--hlx-font-size-xs',
    fontSizeSm: '--hlx-font-size-sm',
    fontSizeMd: '--hlx-font-size-md',
    fontSizeLg: '--hlx-font-size-lg',
    fontSizeBase: '--hlx-font-size-base',
    fontSizeSmall: '--hlx-font-size-small',
    fontSizeCode: '--hlx-font-size-code',
    fontSizeCaption: '--hlx-font-size-caption',
    lineHeight: '--hlx-line-height',
    lineHeightTight: '--hlx-line-height-tight',
    lineHeightCompact: '--hlx-line-height-compact',
    lineHeightCode: '--hlx-line-height-code',
  },
  radius: {
    sm: '--hlx-radius-sm',
    md: '--hlx-radius-md',
    lg: '--hlx-radius-lg',
  },
  layout: {
    maxWidth: '--hlx-max-width',
  },
  shadow: {
    xs: '--hlx-shadow-xs',
    topBar: '--hlx-shadow-top-bar',
    modal: '--hlx-shadow-modal',
    menu: '--hlx-shadow-menu',
  },
} as const

export type TokenGroup = keyof typeof TOKEN_GROUPS
/** Overrides for some tokens, by group and name. */
export type ThemeTokens = { [G in TokenGroup]?: { [N in keyof (typeof TOKEN_GROUPS)[G]]?: string } }

/** The tokens that read the site's own `--hlx-host-*` first: colors and fonts. */
export const HOSTED_TOKENS: readonly string[] = [
  '--hlx-color-accent',
  '--hlx-color-accent-light',
  '--hlx-color-alert-caution',
  '--hlx-color-alert-important',
  '--hlx-color-alert-info',
  '--hlx-color-alert-tip',
  '--hlx-color-alert-warning',
  '--hlx-color-bg',
  '--hlx-color-bg-elevated',
  '--hlx-color-bg-secondary',
  '--hlx-color-bg-tertiary',
  '--hlx-color-border',
  '--hlx-color-border-subtle',
  '--hlx-color-code-bg',
  '--hlx-color-code-header-bg',
  '--hlx-color-code-text',
  '--hlx-color-fill',
  '--hlx-color-fill-quaternary',
  '--hlx-color-fill-secondary',
  '--hlx-color-fill-tertiary',
  '--hlx-color-hr-border',
  '--hlx-color-link',
  '--hlx-color-quote-bg',
  '--hlx-color-quote-border',
  '--hlx-color-ring',
  '--hlx-color-scrim',
  '--hlx-color-text',
  '--hlx-color-text-quaternary',
  '--hlx-color-text-secondary',
  '--hlx-color-text-tertiary',
  '--hlx-font-family',
  '--hlx-font-family-kai',
  '--hlx-font-family-sans',
  '--hlx-font-family-serif',
  '--hlx-font-mono',
]

const FONTS = {
  fontFamilySans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "PingFang SC", "Hiragino Sans GB", "Microsoft JhengHei", "Microsoft YaHei", "Noto Sans TC", "Noto Sans SC", Roboto, Helvetica, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"',
  fontFamilySerif: '"Noto Serif CJK TC", "Noto Serif TC", "Source Han Serif TC", "Noto Serif CJK SC", "Source Han Serif SC", "Source Han Serif", "source-han-serif-sc", "Songti TC", "Songti SC", STSong, "华文宋体", serif',
  fontFamilyKai: '"楷體", "楷体", KaiTi, STKaiti, "Kaiti TC", "Kaiti SC", "LXGW WenKai TC", "LXGW WenKai", "霞鹜文楷", "Noto Serif CJK TC", "Noto Serif CJK SC", serif',
  fontMono: '"SF Mono", SFMono-Regular, ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, "PingFang TC", "PingFang SC", "Noto Sans TC", "Noto Sans SC", monospace',
}

const LIGHT: Record<string, string> = {
  text: '#171717',
  textSecondary: '#404040',
  textTertiary: '#737373',
  textQuaternary: '#a3a3a3',
  bg: '#ffffff',
  bgSecondary: '#fafafa',
  bgTertiary: '#f5f5f5',
  bgElevated: '#ffffff',
  fill: 'rgb(0 0 0 / 0.07)',
  fillSecondary: 'rgb(0 0 0 / 0.045)',
  fillTertiary: 'rgb(0 0 0 / 0.03)',
  fillQuaternary: 'rgb(0 0 0 / 0.02)',
  border: '#e5e5e5',
  borderSubtle: '#f0f0f0',
  ring: 'rgb(0 0 0 / 0.08)',
  scrim: 'rgb(0 0 0 / 0.32)',
  accent: '#2563eb',
  accentLight: 'color-mix(in oklab, var(--hlx-color-accent) 10%, transparent)',
  link: '#2563eb',
  codeText: '#171717',
  codeBg: '#f5f5f5',
  codeHeaderBg: '#f5f5f5',
  hrBorder: '#e5e5e5',
  quoteBorder: '#e5e5e5',
  quoteBg: '#f5f5f5',
  alertInfo: '#2563eb',
  alertWarning: '#b45309',
  alertTip: '#15803d',
  alertCaution: '#dc2626',
  alertImportant: '#7c3aed',
}
const DARK: Record<string, string> = {
  text: '#ededed',
  textSecondary: '#c4c4c4',
  textTertiary: '#8f8f8f',
  textQuaternary: '#5c5c5c',
  bg: '#0a0a0a',
  bgSecondary: '#121212',
  bgTertiary: '#1a1a1a',
  bgElevated: '#171717',
  fill: 'rgb(255 255 255 / 0.09)',
  fillSecondary: 'rgb(255 255 255 / 0.06)',
  fillTertiary: 'rgb(255 255 255 / 0.04)',
  fillQuaternary: 'rgb(255 255 255 / 0.025)',
  border: '#262626',
  borderSubtle: '#1c1c1c',
  ring: 'rgb(255 255 255 / 0.12)',
  scrim: 'rgb(0 0 0 / 0.56)',
  accent: '#60a5fa',
  accentLight: 'color-mix(in oklab, var(--hlx-color-accent) 16%, transparent)',
  link: '#60a5fa',
  codeText: '#ededed',
  codeBg: '#1a1a1a',
  codeHeaderBg: '#1a1a1a',
  hrBorder: '#262626',
  quoteBorder: '#262626',
  quoteBg: '#1a1a1a',
  alertInfo: '#60a5fa',
  alertWarning: '#fbbf24',
  alertTip: '#4ade80',
  alertCaution: '#f87171',
  alertImportant: '#a78bfa',
}
const SHADOW_LIGHT: Record<string, string> = {
  xs: '0 0 0 1px var(--hlx-color-ring), 0 1px 2px rgb(0 0 0 / 0.05)',
  topBar: '0 0 0 1px var(--hlx-color-ring), 0 4px 12px rgb(0 0 0 / 0.06), 0 12px 32px -8px rgb(0 0 0 / 0.12)',
  modal: '0 0 0 1px rgb(0 0 0 / 0.06), 0 16px 48px -12px rgb(0 0 0 / 0.25)',
  menu: '0 0 0 1px var(--hlx-color-ring), 0 4px 12px rgb(0 0 0 / 0.06), 0 12px 32px -8px rgb(0 0 0 / 0.12)',
}
const SHADOW_DARK: Record<string, string> = {
  xs: '0 0 0 1px var(--hlx-color-ring), 0 1px 2px rgb(0 0 0 / 0.4)',
  topBar: '0 0 0 1px var(--hlx-color-ring), 0 8px 24px rgb(0 0 0 / 0.5), 0 16px 40px -8px rgb(0 0 0 / 0.6)',
  modal: '0 0 0 1px rgb(255 255 255 / 0.08), 0 16px 48px -12px rgb(0 0 0 / 0.7)',
  menu: '0 0 0 1px var(--hlx-color-ring), 0 8px 24px rgb(0 0 0 / 0.5), 0 16px 40px -8px rgb(0 0 0 / 0.6)',
}

interface Layout { space: Record<string, string>, flow: Record<string, string>, typography: Record<string, string>, radius: Record<string, string>, layout: Record<string, string> }
const BASE_TYPOGRAPHY: Record<string, string> = {
  ...FONTS,
  fontFamily: 'var(--hlx-font-family-sans)',
  fontSize2xs: '0.625em',
  fontSizeXs: '0.75em',
  fontSizeSm: '0.8125em',
  fontSizeMd: '0.875em',
  fontSizeLg: '1.25em',
  fontSizeBase: '16px',
  fontSizeSmall: '14px',
  fontSizeCode: '0.8125em',
  fontSizeCaption: '0.8125em',
  lineHeight: '1.75',
  lineHeightTight: '1.35',
  lineHeightCompact: '1.6',
  lineHeightCode: '1.7',
}
const SPACE = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
}
const RADIUS = { sm: '4px', md: '8px', lg: '12px' }
const PROSE = {
  paragraph: '1.25em',
  list: '0.375em',
  block: '2em',
  heading: '2em',
}
const COMPACT = {
  paragraph: '0.6em',
  list: '0.25em',
  block: '1em',
  heading: '1em',
}

interface Layout { space: Record<string, string>, flow: Record<string, string>, typography: Record<string, string>, radius: Record<string, string>, layout: Record<string, string> }
const LAYOUTS: Record<EditorVariantName, Layout> = {
  article: {
    space: SPACE,
    flow: PROSE,
    typography: BASE_TYPOGRAPHY,
    radius: RADIUS,
    layout: { maxWidth: '700px' },
  },
  note: {
    space: SPACE,
    flow: { ...PROSE, paragraph: '0.5em' },
    typography: { ...BASE_TYPOGRAPHY, fontFamily: 'var(--hlx-font-family-serif)', lineHeight: '1.85' },
    radius: RADIUS,
    layout: { maxWidth: '700px' },
  },
  comment: {
    space: {
      xs: '2px',
      sm: '4px',
      md: '10px',
      lg: '16px',
      xl: '20px',
    },
    flow: COMPACT,
    typography: {
      ...BASE_TYPOGRAPHY,
      fontSizeBase: '14px',
      fontSizeSmall: '12px',
      fontSizeCode: '0.9286em',
      fontSizeCaption: '0.9286em',
      lineHeight: '1.6',
      lineHeightTight: '1.3',
    },
    radius: { sm: '3px', md: '6px', lg: '12px' },
    layout: { maxWidth: 'none' },
  },
  chat: {
    space: SPACE,
    flow: { ...COMPACT, paragraph: '0.75em' },
    typography: {
      ...BASE_TYPOGRAPHY,
      fontSizeBase: '15px',
      fontSizeSmall: '13px',
      fontSizeCode: '0.8667em',
      fontSizeCaption: '0.8667em',
      lineHeight: '1.65',
      lineHeightTight: '1.3',
    },
    radius: RADIUS,
    layout: { maxWidth: 'none' },
  },
}

/** Every token's value for a variant and scheme, by CSS variable, as the site sets nothing. */
export function tokenValues(variant: EditorVariantName, scheme: 'light' | 'dark'): Record<string, string> {
  const layout = LAYOUTS[variant]
  const colors = scheme === 'dark'
    ? DARK
    : variant === 'comment' || variant === 'chat'
      ? { ...LIGHT, quoteBg: '#fafafa' }
      : LIGHT
  const sources: Record<TokenGroup, Record<string, string>> = {
    color: colors,
    space: layout.space,
    flow: layout.flow,
    typography: layout.typography,
    radius: layout.radius,
    layout: layout.layout,
    shadow: scheme === 'dark'
      ? SHADOW_DARK
      : SHADOW_LIGHT,
  }
  const values: Record<string, string> = {}
  for (const [group, names] of Object.entries(TOKEN_GROUPS) as [TokenGroup, Record<string, string>][]) {
    for (const [name, variable] of Object.entries(names))
      values[variable] = sources[group][name]
  }
  return values
}

/**
 * CSS variables for some token overrides: put them on an
 * element's style. Names it doesn't know, and values that aren't text, are left out.
 */
export function themeStyle(tokens: ThemeTokens | undefined): Record<string, string> {
  const style: Record<string, string> = {}
  for (const [group, values] of Object.entries(tokens ?? {})) {
    const names = (TOKEN_GROUPS as Record<string, Record<string, string>>)[group]
    if (!names || !values || typeof values !== 'object')
      continue
    for (const [name, value] of Object.entries(values as Record<string, unknown>)) {
      if (typeof value === 'string' && names[name])
        style[names[name]] = value
    }
  }
  return style
}
