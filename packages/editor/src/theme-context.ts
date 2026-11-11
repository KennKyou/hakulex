import type { ColorScheme, EditorVariant } from '@hakulex/style-token'
import type { ComputedRef, InjectionKey } from 'vue'
import { computed, inject, provide } from 'vue'

export interface EditorThemeState {
  variant: EditorVariant
  colorScheme: ColorScheme
  /** The site's token overrides, as CSS variables (see `themeStyle`); empty without any. */
  style: Record<string, string>
}

const EditorThemeKey: InjectionKey<ComputedRef<EditorThemeState>> = Symbol('EditorTheme')

/** Called by `<RichEditor>`; makes its variant / color scheme available to plugins. */
export function provideEditorTheme(theme: () => EditorThemeState): void {
  provide(EditorThemeKey, computed(theme))
}

/**
 * The surrounding editor's variant, color scheme and the site's token overrides. Popovers
 * teleported out of the editor put these on their own `.hlx-root` so tokens resolve the same.
 */
export function useEditorTheme(): ComputedRef<EditorThemeState> {
  return inject(EditorThemeKey, () => computed<EditorThemeState>(() => ({ variant: 'article', colorScheme: 'light', style: {} })), true)
}
