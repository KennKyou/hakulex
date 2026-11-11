import type { ShallowRef } from 'vue'
import { getCurrentScope, inject, onScopeDispose, shallowRef } from 'vue'
import { EditorCoreKey } from '../editor-core-key'

/*
 * What a plugin adds to how images are added
 * registerImageEditor: an editor for each image in the list, and a step before uploads.
 * One for an editor and the editors inside it.
 */

export interface GpsInfo {
  latitude: number
  longitude: number
}

/** The site's own way to find and remove a photo's location. */
export interface ImageEditPrivacy {
  detectGps: (file: File) => Promise<GpsInfo | null>
  stripGps: (file: File) => Promise<File>
}

export interface ImageEditResult {
  file: File
  /** What was done, such as 「已裁切 · 1 個標註」. */
  summary?: string
}

export interface ImageEditorCapability {
  /** Edits a file; `null` when the author gives up. */
  edit: (file: File) => Promise<ImageEditResult | null>
}

export type ImagePreprocessSource = 'drop' | 'paste' | 'dialog' | 'replace' | 'gallery'

/** Runs before files are uploaded; `null` cancels, an empty list uploads nothing. */
export type ImagePreprocess = (files: File[], meta: { source: ImagePreprocessSource }) => Promise<File[] | null>

export interface ImageTools {
  editor: ShallowRef<ImageEditorCapability | null>
  preprocess: ShallowRef<ImagePreprocess | null>
  /**
   * Opens the list of images to insert with these files: the
   * files it gives back, or `null` when cancelled. Set by the outer editor.
   */
  review: ShallowRef<ImagePreprocess | null>
}

export function createImageTools(): ImageTools {
  return {
    editor: shallowRef(null),
    preprocess: shallowRef(null),
    review: shallowRef(null),
  }
}

/** The tools of the editor this component is in. */
export function useImageTools(): ImageTools {
  const core = inject(EditorCoreKey, null)
  if (!core)
    throw new Error('useImageTools needs to be inside <RichEditor>.')
  return core.imageTools
}

function register<T>(slot: ShallowRef<T | null>, value: T): () => void {
  slot.value = value
  const unregister = () => {
    if (slot.value === value)
      slot.value = null
  }
  // Inside a component, it goes away with it.
  if (getCurrentScope())
    onScopeDispose(unregister)
  return unregister
}

export function registerImageEditor(tools: ImageTools, capability: ImageEditorCapability): () => void {
  return register(tools.editor, capability)
}

export function registerImagePreprocess(tools: ImageTools, preprocess: ImagePreprocess): () => void {
  return register(tools.preprocess, preprocess)
}

/** The files to upload: as they are without a step, and the originals when the step fails. */
export async function resolvePreprocessTargets(files: File[], source: ImagePreprocessSource, tools: ImageTools | null): Promise<File[]> {
  const preprocess = tools?.preprocess.value
  if (!preprocess || !files.length)
    return files
  try {
    return (await preprocess(files, { source })) ?? []
  }
  catch (cause) {
    console.error('[hakulex image] preprocess failed, uploading the originals', cause)
    return files
  }
}
