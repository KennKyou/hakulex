import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const editor = (page: Page) => page.locator('.hlx-content').first()
const undo = (page: Page) => page.keyboard.press('ControlOrMeta+Z')
const left = (page: Page) => editor(page).locator('.hlx-image-block[data-layout="float-left"]')
const right = (page: Page) => editor(page).locator('.hlx-image-block[data-layout="float-right"]')

const errors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error')
      seen.push(message.text())
  })
  await page.goto('/editor')
  // 測試用文件 start closed.
  await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
    element.open = true
  })
  await page.getByRole('button', { name: '載入連結卡片和繞排圖片' }).click()
  await expect(left(page)).toHaveCount(1)
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

/** Text after a floating image runs beside it: its first line starts past the image. */
async function wraps(page: Page, side: 'left' | 'right') {
  const image = side === 'left'
    ? left(page)
    : right(page).first()
  return image.evaluate((block, which) => {
    const paragraph = block.nextElementSibling!
    const range = document.createRange()
    range.selectNodeContents(paragraph)
    const line = range.getClientRects()[0]
    const box = block.getBoundingClientRect()
    return which === 'left'
      ? line.left >= box.right - 1 && line.top < box.bottom
      : line.right <= box.left + 1 && line.top < box.bottom
  }, side)
}

test('text wraps around floating images, at the width they ask for', async ({ page }) => {
  expect(await wraps(page, 'left')).toBe(true)
  expect(await wraps(page, 'right')).toBe(true)
  const content = (await editor(page).boundingBox())!
  const leftBox = (await left(page).boundingBox())!
  const rightBox = (await right(page).first().boundingBox())!
  expect(Math.abs(leftBox.x - content.x)).toBeLessThan(40)
  expect(leftBox.width / content.width).toBeGreaterThan(0.3)
  expect(leftBox.width / content.width).toBeLessThan(0.5)
  expect(rightBox.width).toBeLessThan(leftBox.width)
  // The picture fills its block rather than counting the percentage again.
  const picture = (await right(page).first().locator('img.hlx-image').boundingBox())!
  expect(Math.abs(picture.width - rightBox.width)).toBeLessThan(2)
})

test('the preview lays them out the same way', async ({ page }) => {
  await page.getByRole('tab', { name: '預覽' }).click()
  const block = page.locator('.hlx-image-block[data-layout="float-left"]:visible')
  await expect(block).toHaveCSS('float', 'left')
  await expect(page.locator('.hlx-image-block[data-layout="float-right"]:visible').first()).toHaveCSS('float', 'right')
})

test('a floating image at the end stays inside the content', async ({ page }) => {
  const last = right(page).last()
  const content = (await editor(page).boundingBox())!
  const box = (await last.boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(content.y + content.height + 1)
})

test('a narrow screen stacks them', async ({ page }) => {
  await page.setViewportSize({ width: 500, height: 800 })
  await expect(left(page)).toHaveCSS('float', 'none')
  await expect(right(page).first()).toHaveCSS('float', 'none')
  const content = (await editor(page).boundingBox())!
  const box = (await left(page).boundingBox())!
  expect(box.width / content.width).toBeGreaterThan(0.9)
})

test('the panel changes the layout as it is chosen, with undo', async ({ page }) => {
  await left(page).locator('img').click()
  await left(page).click()
  const edit = page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' })
  await edit.click()
  const panel = page.locator('.hlx-block-panel[aria-label="圖片"]')
  await expect(panel.locator('select[name="layout"]')).toHaveValue('float-left')
  await panel.locator('select[name="layout"]').selectOption('float-right')
  await expect(left(page)).toHaveCount(0)
  await edit.click()
  await expect(panel).toHaveCount(0)
  await expect(right(page)).toHaveCount(3)
  await undo(page)
  await expect(left(page)).toHaveCount(1)
})

test('the arrow keys reach a floating image and move on', async ({ page }) => {
  await editor(page).locator('.hlx-link-card').click()
  await page.keyboard.press('ArrowDown')
  await expect(left(page).locator('.hlx-image-editor[data-selected]')).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await expect(left(page).locator('.hlx-image-editor[data-selected]')).toHaveCount(0)
  await page.keyboard.type('字')
  await expect(left(page).locator('+ p')).toContainText('字')
})

test('dragging resizes a floating image, which stays floating', async ({ page }) => {
  await left(page).locator('img').click()
  const before = (await left(page).boundingBox())!
  const handle = left(page).locator('.hlx-image-resize[data-side="right"]')
  const grip = (await handle.boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x + grip.width / 2 - 80, grip.y + grip.height / 2, { steps: 4 })
  const during = (await left(page).boundingBox())!
  expect(before.width - during.width).toBeGreaterThan(40)
  await page.mouse.up()
  await expect.poll(async () => (await left(page).boundingBox())!.width).toBeLessThan(before.width - 40)
  await expect(left(page)).toHaveCSS('float', 'left')
  expect(await wraps(page, 'left')).toBe(true)
  await undo(page)
  await expect.poll(async () => Math.abs((await left(page).boundingBox())!.width - before.width)).toBeLessThan(2)
})

test('the block handle points at the floating image', async ({ page }) => {
  await left(page).hover()
  const handle = page.locator('.hlx-block-grip')
  await expect(handle).toBeVisible()
  const box = (await left(page).boundingBox())!
  const grip = (await handle.boundingBox())!
  expect(grip.y).toBeGreaterThanOrEqual(box.y - 8)
  expect(grip.y).toBeLessThan(box.y + box.height)
  expect(grip.x + grip.width).toBeLessThanOrEqual(box.x + 2)
})
