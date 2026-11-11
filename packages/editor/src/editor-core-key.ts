import type { InjectionKey } from 'vue'
import type { EditorCoreConfig } from './EditorCorePlugins'

/**
 * On its own so components can inject it without importing `EditorCorePlugins`, which
 * imports the plugins that import those components.
 */
export const EditorCoreKey: InjectionKey<EditorCoreConfig> = Symbol('EditorCore')
