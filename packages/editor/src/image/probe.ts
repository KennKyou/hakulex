export interface ImageSize {
  width: number
  height: number
}

const TIMEOUT_MS = 15000

/** Loads the image in the browser and reads its natural size. Rejects if it can't load. */
export function probeImageSize(src: string): Promise<ImageSize> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)
    image.onload = () => {
      clearTimeout(timer)
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      clearTimeout(timer)
      reject(new Error('load failed'))
    }
    image.src = src
  })
}
