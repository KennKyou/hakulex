import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const IMAGE_URL = 'https://images.test/a.png'
const OTHER_URL = 'https://images.test/b.png'
const MISSING_URL = 'https://images.test/missing.png'
function svg(width: number, height: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="teal"/></svg>`
}

const editor = (page: Page) => page.locator('.hlx-content')
const images = (page: Page) => editor(page).locator('img.hlx-image')
const dialog = (page: Page) => page.locator('.hlx-image-dialog')
// An image in the document is edited in the panel beside it, each change as it is made.
const panel = (page: Page) => page.locator('.hlx-block-panel[aria-label="圖片"]')
/** Puts the panel away from its toolbar, keeping what was written. */
async function closePanel(page: Page) {
  await page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' }).click()
  await expect(panel(page)).toHaveCount(0)
}
const undo = (page: Page) => page.keyboard.press('ControlOrMeta+Z')

const errors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  await page.route(url => url.protocol.startsWith('http') && url.hostname !== 'localhost', route => route.abort())
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  page.on('console', (message) => {
    // The deliberate 404 below is reported by the browser itself.
    if (message.type() === 'error' && !/404|Failed to load resource/.test(message.text()))
      seen.push(message.text())
  })
  await page.route('https://images.test/**', (route) => {
    const url = route.request().url()
    if (url === MISSING_URL)
      return route.fulfill({ status: 404, body: 'not found' })
    return route.fulfill({
      contentType: 'image/svg+xml',
      body: url === OTHER_URL
        ? svg(640, 400)
        : svg(320, 200),
    })
  })
  await page.goto('/editor')
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

async function openDialog(page: Page) {
  await page.keyboard.type('/image', { delay: 10 })
  await expect(page.locator('.hlx-slash-menu')).toContainText('圖片')
  await page.keyboard.press('Enter')
  await expect(dialog(page)).toBeVisible()
}

async function insertImage(page: Page, url = IMAGE_URL) {
  await openDialog(page)
  await dialog(page).locator('input[name="src"]').fill(url)
  // Enter adds it to the list once it has loaded; the insert button then has the focus.
  await page.keyboard.press('Enter')
  await expect(dialog(page).locator('[data-image-dialog-row]')).toHaveCount(1)
  await expect(dialog(page).locator('button[data-primary]')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog(page)).toHaveCount(0)
  await expect(images(page).last()).toHaveAttribute('src', url)
}

/** Text, an image, then more text, with the caret in the last paragraph. */
async function sandwich(page: Page) {
  await editor(page).click()
  await page.keyboard.type('above')
  await page.keyboard.press('Enter')
  await insertImage(page)
  await page.keyboard.type('below')
}

// Lexical's invisible caret anchors next to decorators are not part of the document.
function blockOrder(page: Page) {
  return editor(page).evaluate(root => [...root.children]
    .filter(child => !child.hasAttribute('data-lexical-decorator-boundary'))
    .map(child => child.classList.contains('hlx-image-block')
      ? 'image'
      : child.textContent ?? ''))
}

const selectedImage = (page: Page) => editor(page).locator('.hlx-image-editor[data-selected]')

/** Selecting by clicking, and waiting for what appears on the selected image. */
async function selectImage(page: Page) {
  await images(page).first().click()
  await expect(selectedImage(page)).toHaveCount(1)
  await expect(page.locator('.hlx-image-resize[data-side="right"]')).toBeVisible()
}

/** A real PNG made in the page, so it can go on the clipboard or in a drop. */
const PNG_SNIPPET = `
  async function makePng(width, height) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').fillRect(0, 0, width, height)
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
  }
`

async function copyPng(page: Page) {
  await page.evaluate(`(async () => {
    ${PNG_SNIPPET}
    const blob = await makePng(64, 32)
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  })()`)
}

async function dropTransfer(page: Page, names: string[]) {
  return page.evaluateHandle(`(async () => {
    ${PNG_SNIPPET}
    const data = new DataTransfer()
    for (const name of ${JSON.stringify(names)}) {
      if (name.endsWith('.png'))
        data.items.add(new File([await makePng(64, 32)], name, { type: 'image/png' }))
      else
        data.items.add(new File(['text'], name, { type: 'text/plain' }))
    }
    return data
  })()`)
}

test.describe('inserting with the dialog', () => {
  test('inserts from the slash menu with the real size and a caret below', async ({ page }) => {
    await editor(page).click()
    await insertImage(page)

    await expect(images(page)).toHaveAttribute('width', '320')
    await expect(images(page)).toHaveAttribute('height', '200')
    await expect(editor(page)).not.toContainText('/image')
    await page.keyboard.type('next')
    await expect.poll(() => blockOrder(page)).toEqual(['image', 'next'])
  })

  test('rejects unsafe and missing URLs and keeps the dialog open', async ({ page }) => {
    await editor(page).click()
    await openDialog(page)
    const src = dialog(page).locator('input[name="src"]')

    await src.fill('javascript:alert(1)')
    await page.keyboard.press('Enter')
    await expect(dialog(page).getByRole('alert')).toContainText('不支援')

    await src.fill(MISSING_URL)
    await page.keyboard.press('Enter')
    await expect(dialog(page).getByRole('alert')).toContainText('無法載入')

    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).locator('[data-image-dialog-row]')).toHaveCount(0)
    await expect(images(page)).toHaveCount(0)
  })

  test('returns focus and the caret after Esc, without reordering the document', async ({ page }) => {
    await editor(page).click()
    await page.keyboard.type('one')
    await page.keyboard.press('Enter')
    await page.keyboard.type('two')
    await page.keyboard.press('Enter')
    await openDialog(page)
    await page.keyboard.press('Escape')

    await expect(dialog(page)).toHaveCount(0)
    await expect(editor(page)).toBeFocused()
    await page.keyboard.type('three')
    await expect.poll(() => blockOrder(page)).toEqual(['one', 'two', 'three'])
  })
})

test.describe('working with an image', () => {
  test('reaches the image with the arrow keys from both sides', async ({ page }) => {
    await sandwich(page)
    await page.keyboard.press('ArrowUp')
    await expect(selectedImage(page)).toHaveCount(1)
    await page.keyboard.press('ArrowUp')
    await expect(selectedImage(page)).toHaveCount(0)
    await page.keyboard.type('!')
    await expect.poll(() => blockOrder(page)).toEqual(['above!', 'image', 'below'])

    await page.keyboard.press('ArrowDown')
    await expect(selectedImage(page)).toHaveCount(1)
    await page.keyboard.press('ArrowDown')
    await expect(selectedImage(page)).toHaveCount(0)
  })

  test('deletes with Backspace and comes back with undo', async ({ page }) => {
    await sandwich(page)
    await selectImage(page)
    await page.keyboard.press('Backspace')
    await expect(images(page)).toHaveCount(0)
    await undo(page)
    await expect(images(page)).toHaveCount(1)
  })

  test('edits the URL with Enter and updates the size', async ({ page }) => {
    await sandwich(page)
    await selectImage(page)
    await page.keyboard.press('Enter')
    await expect(panel(page)).toBeVisible()
    await expect(dialog(page)).toHaveCount(0)
    await panel(page).locator('input[name="src"]').fill(OTHER_URL)
    await page.keyboard.press('Enter')

    await expect(images(page)).toHaveAttribute('src', OTHER_URL)
    await expect(images(page)).toHaveAttribute('width', '640')
    await expect(selectedImage(page)).toHaveCount(1)
  })

  test('adds a paragraph when clicking below a trailing image', async ({ page }) => {
    await editor(page).click()
    await insertImage(page)
    await page.keyboard.press('Backspace')
    await expect.poll(() => blockOrder(page)).toEqual(['image'])

    const box = (await editor(page).boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 4)
    await page.keyboard.type('below')
    await expect.poll(() => blockOrder(page)).toEqual(['image', 'below'])
  })

  test('is inert while read-only', async ({ page }) => {
    await sandwich(page)
    await page.getByRole('checkbox', { name: '可編輯' }).uncheck()
    await images(page).click()
    await expect(selectedImage(page)).toHaveCount(0)
    await expect(page.locator('.hlx-image-resize')).toHaveCount(0)
    await expect(page.locator('.hlx-image-edit')).toHaveCount(0)
    await expect(images(page)).toBeVisible()
  })
})

test.describe('caption', () => {
  test('shows in the editor, preview and SSR, and clears', async ({ page }) => {
    await sandwich(page)
    await selectImage(page)
    await page.keyboard.press('Enter')
    await panel(page).locator('input[name="caption"]').fill('A <b>cat</b>')
    await expect(editor(page).locator('figure figcaption')).toHaveText('A <b>cat</b>')
    await closePanel(page)

    await page.getByRole('tab', { name: '預覽' }).click()
    await expect(page.locator('.hlx-renderer figure figcaption')).toHaveText('A <b>cat</b>')
    await page.getByRole('tab', { name: 'SSR HTML' }).click()
    await expect(page.locator('pre.code-block').first()).toContainText('&lt;b&gt;cat&lt;/b&gt;')

    await page.getByRole('tab', { name: '編輯' }).click()
    await selectImage(page)
    await page.keyboard.press('Enter')
    await panel(page).locator('input[name="caption"]').fill('')
    await expect(editor(page).locator('figure')).toHaveCount(0)
    await closePanel(page)
  })
})

test.describe('display width', () => {
  const widthRatio = (page: Page) => images(page).evaluate((img) => {
    const block = img.closest('.hlx-image-block')!
    return img.getBoundingClientRect().width / block.getBoundingClientRect().width
  })

  async function setWidth(page: Page, percent: string) {
    await selectImage(page)
    await page.keyboard.press('Enter')
    await panel(page).locator('input[name="displayWidth"]').fill(percent)
    await closePanel(page)
  }

  async function dragHandle(page: Page, delta: number) {
    const box = (await page.locator('.hlx-image-resize[data-side="right"]').boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + delta / 2, y, { steps: 3 })
    await page.mouse.move(x + delta, y, { steps: 3 })
  }

  test('sets the width from the panel, and shows it in the preview', async ({ page }) => {
    await sandwich(page)
    await setWidth(page, '50')
    await expect.poll(() => widthRatio(page)).toBeCloseTo(0.5, 1)

    await page.getByRole('tab', { name: '預覽' }).click()
    await expect(page.locator('.hlx-renderer img.hlx-image')).toHaveCSS('width', /px/)
    const ratio = await page.locator('.hlx-renderer img.hlx-image').evaluate(img =>
      img.getBoundingClientRect().width / img.closest('.hlx-image-block')!.getBoundingClientRect().width)
    expect(ratio).toBeCloseTo(0.5, 1)
  })

  test('drags the handle, previews, commits on release, and undoes once', async ({ page }) => {
    await sandwich(page)
    await setWidth(page, '50')
    await selectImage(page)

    await dragHandle(page, 80)
    const during = await widthRatio(page)
    expect(during).toBeGreaterThan(0.6)
    await page.mouse.up()
    await expect.poll(() => widthRatio(page)).toBeCloseTo(during, 1)
    await expect(selectedImage(page)).toHaveCount(1)

    await undo(page)
    await expect.poll(() => widthRatio(page)).toBeCloseTo(0.5, 1)
  })

  test('cancels a drag with Esc', async ({ page }) => {
    await sandwich(page)
    await setWidth(page, '50')
    await selectImage(page)

    await dragHandle(page, 80)
    await page.keyboard.press('Escape')
    await expect.poll(() => widthRatio(page)).toBeCloseTo(0.5, 1)
    await page.mouse.up()
    await expect.poll(() => widthRatio(page)).toBeCloseTo(0.5, 1)
  })
})

test.describe('pasting and dropping files', () => {
  test('pastes an image from the real clipboard, after the list and the upload', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'a test can not put an image on the clipboard in Firefox')
    await editor(page).click()
    await page.keyboard.type('before')
    await copyPng(page)
    await page.keyboard.press('ControlOrMeta+V')

    // The demo has the image editor: what is pasted is listed first.
    await expect(dialog(page).locator('[data-image-dialog-row]')).toHaveCount(1)
    await expect(images(page)).toHaveCount(0)
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.locator('.hlx-image-upload [role="status"]')).toBeVisible()
    await expect(images(page)).toHaveCount(0)
    await expect(images(page)).toHaveCount(1)
    await expect(page.locator('.hlx-image-upload')).toHaveCount(0)
    await expect(images(page)).toHaveAttribute('src', /^data:image\/png/)
    await expect(images(page)).toHaveAttribute('width', '64')

    await undo(page)
    await expect(images(page)).toHaveCount(0)
    await expect(editor(page)).toContainText('before')
  })

  test('reports a failed upload and lets the author dismiss it', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'a test can not put an image on the clipboard in Firefox')
    await page.getByRole('checkbox', { name: '模擬上傳失敗' }).check()
    await editor(page).click()
    await copyPng(page)
    await page.keyboard.press('ControlOrMeta+V')
    await dialog(page).locator('button[data-primary]').click()

    await expect(page.getByRole('alert')).toContainText('1 張')
    await expect(images(page)).toHaveCount(0)
    await page.getByRole('button', { name: '關閉訊息' }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('drops several images in order, leaving other files to uploadFile', async ({ page }) => {
    await editor(page).click()
    await page.keyboard.type('text')
    const paragraph = editor(page).locator('p').first()
    const box = (await paragraph.boundingBox())!
    const point = { clientX: box.x + 10, clientY: box.y + box.height / 2 }
    const dataTransfer = await dropTransfer(page, ['one.png', 'notes.txt', 'two.png'])

    await paragraph.dispatchEvent('dragenter', { dataTransfer, ...point })
    await expect(editor(page)).toHaveAttribute('data-image-drop', '')
    await paragraph.dispatchEvent('dragover', { dataTransfer, ...point })
    await paragraph.dispatchEvent('drop', { dataTransfer, ...point })
    await expect(editor(page)).not.toHaveAttribute('data-image-drop')

    // The images are listed first, in order.
    await expect(dialog(page).locator('.hlx-image-row-name')).toHaveText(['one.png', 'two.png'])
    await dialog(page).locator('button[data-primary]').click()
    await expect(images(page)).toHaveCount(2)
    // The demo has uploadFile as well. Without it, skipping is covered by image-upload.test.ts.
    await expect(editor(page).locator('.hlx-file-name')).toHaveText('notes.txt')

    // Images and other files finish on their own, so each is an undo step.
    await undo(page)
    await undo(page)
    await expect(images(page)).toHaveCount(0)
  })
})
