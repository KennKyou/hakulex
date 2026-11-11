import type { JSHandle, Page } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'

/*
 * The list of images to insert and the edit screen, in a real browser: what is uploaded is
 * read back from the inserted image and checked pixel by pixel.
 */

const editor = (page: Page) => page.locator('.hlx-content').first()
const images = (page: Page) => editor(page).locator('img.hlx-image')
const list = (page: Page) => page.locator('.hlx-image-dialog')
const rows = (page: Page) => list(page).locator('[data-image-dialog-row]')
const screen = (page: Page) => page.locator('.hlx-picture-editor')
const tool = (page: Page, name: string) => screen(page).locator(`.hlx-picture-editor-rail button[aria-label="${name}"]`)
const lastUpload = (page: Page) => page.locator('.last-upload')

const errors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource'))
      seen.push(message.text())
  })
  // Link cards and site icons in the sample must not reach the network. Only http(s): WebKit
  // sends blob: addresses through here too, and those are the pictures being edited.
  await page.route(url => url.protocol.startsWith('http') && url.hostname !== 'localhost', route => route.abort())
  await page.goto('/editor')
  await page.getByRole('button', { name: '清空文件' }).click()
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

/**
 * A 1600 × 1000 picture: blue on the left half, an 8 px checkerboard on the right, so
 * a mosaic shows as the checkerboard going flat. `gps` adds an EXIF block with a location.
 */
const PICTURE_SNIPPET = `
  async function makePicture(type, gps) {
    const canvas = document.createElement('canvas')
    canvas.width = 1600
    canvas.height = 1000
    const context = canvas.getContext('2d')
    context.fillStyle = '#2563eb'
    context.fillRect(0, 0, 800, 1000)
    const image = context.createImageData(800, 1000)
    for (let i = 0; i < 800 * 1000; i++) {
      const x = i % 800
      const y = Math.floor(i / 800)
      const value = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 255 : 0
      image.data.set([value, value, value, 255], i * 4)
    }
    context.putImageData(image, 800, 0)
    let blob = await new Promise(resolve => canvas.toBlob(resolve, type, 0.95))
    if (gps) {
      // APP1 "Exif", little-endian TIFF, IFD0 with a GPS pointer, GPS IFD with latitude and longitude.
      const tiff = new DataView(new ArrayBuffer(8 + 18 + 4 + 54 + 48))
      const u16 = (at, value) => tiff.setUint16(at, value, true)
      const u32 = (at, value) => tiff.setUint32(at, value, true)
      u16(0, 0x4949); u16(2, 42); u32(4, 8)
      u16(8, 1); u16(10, 0x8825); u16(12, 4); u32(14, 1); u32(18, 30); u32(22, 0)
      u16(30, 4)
      const entry = (at, tag, type, count, value) => { u16(at, tag); u16(at + 2, type); u32(at + 4, count); u32(at + 8, value) }
      entry(32, 1, 2, 2, 0x4E)
      entry(44, 2, 5, 3, 84)
      entry(56, 3, 2, 2, 0x45)
      entry(68, 4, 5, 3, 108)
      u32(80, 0)
      const rational = (at, values) => values.forEach((value, n) => { u32(at + n * 8, value); u32(at + n * 8 + 4, 1) })
      rational(84, [25, 2, 0])
      rational(108, [121, 30, 0])
      const header = new Uint8Array([0xFF, 0xE1, 0, 0, 0x45, 0x78, 0x69, 0x66, 0, 0])
      new DataView(header.buffer).setUint16(2, 8 + tiff.byteLength)
      const bytes = new Uint8Array(await blob.arrayBuffer())
      blob = new Blob([bytes.slice(0, 2), header, new Uint8Array(tiff.buffer), bytes.slice(2)], { type })
    }
    return blob
  }
`

/** Makes the picture in the page and gives back its bytes. */
async function makePicture(page: Page, type: string, gps: boolean) {
  const base64 = await page.evaluate(`(async () => {
    ${PICTURE_SNIPPET}
    const blob = await makePicture(${JSON.stringify(type)}, ${gps})
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let text = ''
    for (const byte of bytes)
      text += String.fromCharCode(byte)
    return btoa(text)
  })()`) as string
  return Buffer.from(base64, 'base64')
}

/** Chooses the picture in the list of images to insert, opened from the toolbar. */
async function choosePicture(page: Page, name: string, type = 'image/png', gps = false) {
  const buffer = await makePicture(page, type, gps)
  await editor(page).click()
  await page.getByRole('button', { name: '插入' }).click()
  await page.getByRole('menuitem', { name: '圖片' }).click()
  await expect(list(page)).toBeVisible()
  await list(page).locator('input[type="file"]').setInputFiles({ name, mimeType: type, buffer })
  await expect(rows(page)).toHaveCount(1)
}

/** Drops the picture on the first paragraph, as from the desktop. */
async function dropPicture(page: Page, name: string) {
  await editor(page).click()
  const paragraph = editor(page).locator('p').first()
  const box = (await paragraph.boundingBox())!
  const point = { clientX: box.x + 10, clientY: box.y + box.height / 2 }
  const dataTransfer = await page.evaluateHandle(`(async () => {
    ${PICTURE_SNIPPET}
    const data = new DataTransfer()
    data.items.add(new File([await makePicture('image/png', false)], ${JSON.stringify(name)}, { type: 'image/png' }))
    return data
  })()`) as JSHandle<DataTransfer>
  await paragraph.dispatchEvent('dragenter', { dataTransfer, ...point })
  await paragraph.dispatchEvent('dragover', { dataTransfer, ...point })
  await paragraph.dispatchEvent('drop', { dataTransfer, ...point })
  await expect(rows(page)).toHaveCount(1)
}

/** Whether a JPEG's EXIF block still points to a GPS block. */
function hasGps(dataUrl: string) {
  const bytes = Buffer.from(dataUrl.split(',')[1], 'base64')
  let offset = 2
  while (offset + 4 <= bytes.length) {
    const marker = bytes.readUInt16BE(offset)
    const length = bytes.readUInt16BE(offset + 2)
    if (marker === 0xFFE1 && bytes.toString('latin1', offset + 4, offset + 8) === 'Exif') {
      const tiff = offset + 10
      const little = bytes.readUInt16BE(tiff) === 0x4949
      const u16 = (at: number) => little
        ? bytes.readUInt16LE(tiff + at)
        : bytes.readUInt16BE(tiff + at)
      const u32 = (at: number) => little
        ? bytes.readUInt32LE(tiff + at)
        : bytes.readUInt32BE(tiff + at)
      const ifd = u32(4)
      for (let i = 0; i < u16(ifd); i++) {
        if (u16(ifd + 2 + i * 12) === 0x8825)
          return true
      }
    }
    if (marker === 0xFFDA)
      break
    offset += 2 + length
  }
  return false
}

/** Drags with the mouse in small steps, as a hand would. */
async function drag(page: Page, from: { x: number, y: number }, to: { x: number, y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.waitForTimeout(50)
  await page.mouse.down()
  await page.waitForTimeout(50)
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await page.waitForTimeout(50)
  await page.mouse.up()
}

test('crops, pixelates, marks and shrinks a picture before it is uploaded', async ({ page }) => {
  await choosePicture(page, 'shot.png')
  await expect(rows(page).first()).toContainText('1600 × 1000')
  await expect(lastUpload(page)).toHaveCount(0)

  await rows(page).first().getByRole('button', { name: '編輯' }).click()
  await expect(screen(page)).toBeVisible()
  await expect(screen(page).locator('a[href="https://markerjs.com"]')).toBeVisible()
  await expect(screen(page).locator('.hlx-picture-editor-size-output')).toHaveText('→ 1600 × 1000')

  // Crop off the bottom quarter.
  const picture = (await screen(page).locator('.hlx-crop').boundingBox())!
  const bottom = (await screen(page).locator('[data-handle="s"]').boundingBox())!
  await drag(page, { x: bottom.x + bottom.width / 2, y: bottom.y + bottom.height / 2 }, { x: bottom.x + bottom.width / 2, y: picture.y + picture.height * 0.75 })
  await expect(screen(page).locator('.hlx-picture-editor-size-output')).toHaveText(/→ 1600 × 7\d\d/)

  // Pixelate the top of the checkerboard.
  await tool(page, '馬賽克').click()
  await expect(screen(page).locator('.hlx-crop-image')).toHaveAttribute('src', /^blob:/)
  const cropped = (await screen(page).locator('.hlx-crop').boundingBox())!
  await drag(page, { x: cropped.x + cropped.width * 0.55, y: cropped.y + cropped.height * 0.05 }, { x: cropped.x + cropped.width * 0.95, y: cropped.y + cropped.height * 0.5 })
  await expect(screen(page).getByRole('button', { name: '復原' })).toBeEnabled()

  // An arrow on the blue half.
  await tool(page, '箭頭').click()
  const marks = screen(page).locator('mjs-marker-area')
  await expect(marks).toBeVisible()
  await expect(screen(page).getByRole('button', { name: '顏色 #ef4444' })).toHaveAttribute('aria-pressed', 'true')
  const canvas = (await screen(page).locator('.hlx-picture-editor-canvas').boundingBox())!
  await drag(page, { x: canvas.x + canvas.width * 0.2, y: canvas.y + canvas.height * 0.4 }, { x: canvas.x + canvas.width * 0.35, y: canvas.y + canvas.height * 0.55 })
  await expect(screen(page).getByRole('button', { name: '復原' })).toBeEnabled()

  await screen(page).locator('.hlx-picture-editor-size select').selectOption('1280')
  await screen(page).getByRole('button', { name: '完成' }).click()
  await expect(screen(page)).toHaveCount(0)

  const row = rows(page).first()
  await expect(row).toContainText('已編輯')
  await expect(row).toContainText(/已裁切 · 1 個標註 · 1 處馬賽克 · 1280 × \d+/)
  await expect(row.getByRole('button', { name: '重新編輯' })).toBeVisible()

  await list(page).locator('button[data-primary]').click()
  await expect(list(page)).toHaveCount(0)
  await expect(images(page)).toHaveCount(1)
  await expect(lastUpload(page)).toContainText('shot.png')

  const result = await images(page).first().evaluate(async (img: HTMLImageElement) => {
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const context = canvas.getContext('2d')!
    context.drawImage(img, 0, 0)
    const { data, width } = context.getImageData(0, 0, canvas.width, canvas.height)
    const red = (x0: number, x1: number) => {
      let count = 0
      for (let y = 0; y < canvas.height; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4
          if (data[i] > 180 && data[i + 1] < 90 && data[i + 2] < 90)
            count++
        }
      }
      return count
    }
    /** How often a row turns from dark to light or back: the checkerboard's squares, or bigger blocks. */
    const turns = (x0: number, y: number, length: number) => {
      let count = 0
      for (let x = x0 + 1; x < x0 + length; x++) {
        if (Math.abs(data[(y * width + x) * 4] - data[(y * width + x - 1) * 4]) > 100)
          count++
      }
      return count
    }
    return {
      width: canvas.width,
      height: canvas.height,
      redOnBlue: red(0, Math.floor(width / 2)),
      // In the pixelated part of the checkerboard, and below it, where it was left alone.
      pixelated: turns(Math.floor(width * 0.6), Math.floor(canvas.height * 0.2), 200),
      untouched: turns(Math.floor(width * 0.6), Math.floor(canvas.height * 0.85), 200),
    }
  })
  expect(result.width).toBe(1280)
  expect(result.height).toBeGreaterThan(580)
  expect(result.height).toBeLessThan(620)
  expect(result.redOnBlue).toBeGreaterThan(50)
  expect(result.untouched).toBeGreaterThan(20)
  expect(result.pixelated).toBeLessThan(result.untouched / 2)
})

test('lists a dropped picture, gives back the file itself when nothing is changed, and Esc closes only the top', async ({ page }) => {
  await dropPicture(page, 'plain.png')
  await expect(rows(page).first()).toContainText('1600 × 1000')
  await rows(page).first().getByRole('button', { name: '編輯' }).click()
  await expect(screen(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(screen(page)).toHaveCount(0)
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).not.toContainText('已編輯')

  await rows(page).first().getByRole('button', { name: '編輯' }).click()
  await screen(page).getByRole('button', { name: '完成' }).click()
  await expect(rows(page).first()).not.toContainText('已編輯')

  // Started from a drop with nothing changed: the list closes without asking.
  await page.keyboard.press('Escape')
  await expect(list(page)).toHaveCount(0)
  await expect(images(page)).toHaveCount(0)
  await expect(lastUpload(page)).toHaveCount(0)
})

test('removes a photo\'s location before uploading, unless the author keeps it', async ({ page }) => {
  await choosePicture(page, 'trip.jpg', 'image/jpeg', true)
  const remove = rows(page).first().getByRole('checkbox', { name: '上傳前移除 GPS' })
  await expect(remove).toBeChecked()
  await list(page).locator('button[data-primary]').click()
  await expect(images(page)).toHaveCount(1)
  const stripped = await images(page).first().getAttribute('src')
  expect(hasGps(stripped!)).toBe(false)

  await choosePicture(page, 'trip.jpg', 'image/jpeg', true)
  await rows(page).first().getByRole('checkbox', { name: '上傳前移除 GPS' }).uncheck()
  await page.getByRole('checkbox', { name: '保留原圖（不壓縮）' }).check()
  await list(page).locator('button[data-primary]').click()
  await expect(images(page)).toHaveCount(2)
  await expect(lastUpload(page)).toContainText('保留原圖')
  const kept = await images(page).nth(0).getAttribute('src') === stripped
    ? await images(page).nth(1).getAttribute('src')
    : await images(page).nth(0).getAttribute('src')
  expect(hasGps(kept!)).toBe(true)
})
