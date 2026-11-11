import type { InjectionKey } from 'vue'

/*
 * A dynamic block: a component the site serves as a JavaScript module, loaded by its address
 * when a reader comes to it. The module's default export follows the mount contract,
 * which no framework owns, so a component may be written in anything.
 */

export const DEFAULT_DYNAMIC_HEIGHT = 320

export interface DynamicData {
  url: string
  props: Record<string, unknown>
  /** Space kept for it before it loads, in px: it never takes less. */
  initialHeight: number
}

/** What a stored node means. Bad values count as missing; the node itself is left as it is. */
export function normalizeDynamic(node: Record<string, unknown>): DynamicData {
  const { url, props, initialHeight } = node
  return {
    url: typeof url === 'string'
      ? url.trim()
      : '',
    props: props && typeof props === 'object' && !Array.isArray(props)
      ? props as Record<string, unknown>
      : {},
    initialHeight: typeof initialHeight === 'number' && Number.isFinite(initialHeight) && initialHeight > 0
      ? initialHeight
      : DEFAULT_DYNAMIC_HEIGHT,
  }
}

/** What the component is told about the page it is on. */
export interface DynamicHostContext {
  theme: 'light' | 'dark'
}

export interface DynamicMountInput {
  host: DynamicHostContext
  props: Record<string, unknown>
}

export interface DynamicMountHandle {
  unmount: () => void
  update?: (input: DynamicMountInput) => void
  /** Kept for long documents that use it; nothing here calls it. */
  getState?: () => unknown
  setState?: (state: unknown) => void
}

/** The default export of a dynamic block's module. */
export interface DynamicComponentModule {
  mount: (container: HTMLElement, input: DynamicMountInput) => DynamicMountHandle
}

export function isDynamicComponentModule(value: unknown): value is DynamicComponentModule {
  return typeof value === 'object' && value !== null && typeof (value as DynamicComponentModule).mount === 'function'
}

/**
 * Whether an address may load: `empty`, `unsafe` (not http(s), or not an address at all),
 * `not-allowed` (another origin the site didn't allow), or `ok`. A module runs with the page's
 * own rights, so only the page's origin loads unless the site says otherwise.
 */
export type DynamicUrlStatus = 'ok' | 'empty' | 'unsafe' | 'not-allowed'

export function dynamicUrlStatus(url: string, base: string, allow?: (url: string) => boolean): DynamicUrlStatus {
  if (!url)
    return 'empty'
  let resolved: URL
  try {
    resolved = new URL(url, base)
  }
  catch {
    return 'unsafe'
  }
  if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:')
    return 'unsafe'
  if (resolved.origin === new URL(base).origin)
    return 'ok'
  return allow?.(resolved.href)
    ? 'ok'
    : 'not-allowed'
}

// The hints keep bundlers from trying to resolve an address only known at run time.
export const importDynamicModule = (url: string): Promise<unknown> => import(/* @vite-ignore */ /* webpackIgnore: true */ url)

/** How a module is loaded: a test, or a site with its own loader, can give another. */
export const DynamicImportKey: InjectionKey<(url: string) => Promise<unknown>> = Symbol('DynamicImport')

/** What the renderer or the editor around a block says: which addresses load, and the theme. */
export interface DynamicSettings {
  allow?: (url: string) => boolean
  theme: 'light' | 'dark'
}
export const DynamicSettingsKey: InjectionKey<() => DynamicSettings> = Symbol('DynamicSettings')
