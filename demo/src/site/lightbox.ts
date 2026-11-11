import type { ImageClickPayload } from '@hakulex/renderer'
import { shallowRef } from 'vue'

/* The image group the demo's lightbox shows; renderers open it through onImageClick. */

export const lightbox = shallowRef<ImageClickPayload | null>(null)

export function openLightbox(payload: ImageClickPayload) {
  lightbox.value = payload
}

export function closeLightbox() {
  lightbox.value = null
}
