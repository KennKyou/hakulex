import type { Page } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

const editor = (page: Page) => page.locator('.hlx-content').first()
const undo = (page: Page) => page.keyboard.press('ControlOrMeta+Z')
const block = (page: Page) => editor(page).locator('.hlx-block-editor:has(.hlx-gallery)')
const dialog = (page: Page) => page.locator('.hlx-block-dialog')
const rows = (page: Page) => dialog(page).locator('.hlx-gallery-row')

interface Json { type: string, images?: { src: string, alt?: string }[], layout?: string }

async function stored(page: Page): Promise<Json[]> {
  const text = await page.locator('details.json pre').textContent()
  return (JSON.parse(text!) as { root: { children: Json[] } }).root.children
}
const galleries = async (page: Page) => (await stored(page)).filter(node => node.type === 'gallery')

const errors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  await page.route(url => url.protocol.startsWith('http') && url.hostname !== 'localhost', route => route.abort())
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource'))
      seen.push(message.text())
  })
  await page.route(/picsum\.photos|example\.com/, route => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }))
  await page.goto('/editor')
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

async function insert(page: Page) {
  await editor(page).click()
  await page.keyboard.type('/gallery')
  await expect(page.locator('.hlx-slash-menu [role="option"]')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(dialog(page)).toBeVisible()
}

async function saved(page: Page) {
  await insert(page)
  await rows(page).first().locator('[data-field="src"]').fill('https://example.com/a.png')
  await rows(page).first().locator('[data-field="alt"]').fill('甲')
  await dialog(page).getByRole('button', { name: '儲存' }).click()
  await expect(block(page)).toBeVisible()
}

test.describe('inserting', () => {
  test('from the slash menu, as one undo step', async ({ page }) => {
    await saved(page)
    await expect(block(page).locator('img')).toHaveAttribute('alt', '甲')
    await expect.poll(async () => (await galleries(page))[0]?.images).toEqual([
      { src: 'https://example.com/a.png', alt: '甲' },
    ])
    await undo(page)
    await expect(block(page)).toHaveCount(0)
  })

  test('won\'t insert without an image', async ({ page }) => {
    await insert(page)
    await dialog(page).getByRole('button', { name: '儲存' }).click()
    await expect(dialog(page).getByRole('alert')).toBeVisible()
    await expect(dialog(page)).toBeVisible()
  })

  test('from the toolbar', async ({ page }) => {
    await editor(page).click()
    await page.getByRole('button', { name: '插入' }).click()
    await page.getByRole('menuitem', { name: '圖庫' }).click()
    await expect(dialog(page)).toBeVisible()
  })
})

test.describe('editing', () => {
  test('uploads real files, and saves once they are done', async ({ page }) => {
    await insert(page)
    await dialog(page).locator('input[type="file"]').setInputFiles([
      { name: 'a.png', mimeType: 'image/png', buffer: PNG },
      { name: 'b.png', mimeType: 'image/png', buffer: PNG },
    ])
    // The demo has the image editor: they are listed first.
    const list = page.locator('.hlx-image-dialog')
    await expect(list.locator('[data-image-dialog-row]')).toHaveCount(2)
    await list.locator('button[data-primary]').click()
    await expect(list).toHaveCount(0)
    await expect(dialog(page).getByRole('button', { name: '儲存' })).toBeDisabled()
    await expect(rows(page)).toHaveCount(2)
    await expect(dialog(page).getByRole('button', { name: '儲存' })).toBeEnabled()
    await dialog(page).getByRole('button', { name: '儲存' }).click()
    await expect(block(page).locator('img')).toHaveCount(2)
  })

  test('moves and removes, changing the layout', async ({ page }) => {
    await saved(page)
    await block(page).click()
    await page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' }).click()
    await dialog(page).getByRole('button', { name: '新增圖片' }).click()
    await rows(page).nth(1).locator('[data-field="src"]').fill('https://example.com/b.png')
    await rows(page).nth(1).getByRole('button', { name: '上移' }).click()
    await dialog(page).locator('[data-field="layout"]').selectOption('carousel')
    await dialog(page).getByRole('button', { name: '儲存' }).click()
    await expect(block(page).locator('.hlx-gallery')).toHaveAttribute('data-layout', 'carousel')
    await expect.poll(async () => (await galleries(page))[0].images?.map(image => image.src)).toEqual(['https://example.com/b.png', 'https://example.com/a.png'])
    await undo(page)
    await expect(block(page).locator('img')).toHaveCount(1)
  })

  test('won\'t take an unsafe address', async ({ page }) => {
    await saved(page)
    await block(page).click()
    await page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' }).click()
    await rows(page).first().locator('[data-field="src"]').fill('javascript:alert(1)')
    await dialog(page).getByRole('button', { name: '儲存' }).click()
    await expect(dialog(page).getByRole('alert')).toBeVisible()
    await expect(rows(page).first().locator('[data-field="src"]')).toHaveAttribute('aria-invalid', 'true')
  })

  test('Esc asks before throwing changes away', async ({ page }) => {
    await saved(page)
    await block(page).click()
    await page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' }).click()
    await rows(page).first().locator('[data-field="alt"]').fill('乙')
    await page.keyboard.press('Escape')
    await expect(dialog(page).getByText('有未儲存的修改')).toBeVisible()
    await dialog(page).getByRole('button', { name: '放棄' }).click()
    await expect.poll(async () => (await galleries(page))[0].images?.[0].alt).toBe('甲')
  })
})

test.describe('the sample', () => {
  test.beforeEach(async ({ page }) => {
    // 測試用文件 start closed.
    await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
      element.open = true
    })
    await page.getByRole('button', { name: '載入程式碼片段、圖庫和對話' }).click()
    await expect(block(page)).toHaveCount(3)
  })

  test('has the three layouts', async ({ page }) => {
    await expect(block(page).locator('.hlx-gallery')).toHaveCount(3)
    await expect(block(page).nth(0).locator('.hlx-gallery')).toHaveAttribute('data-layout', 'grid')
    await expect(block(page).nth(1).locator('.hlx-gallery')).toHaveAttribute('data-layout', 'masonry')
    await expect(block(page).nth(2).locator('.hlx-gallery')).toHaveAttribute('data-layout', 'carousel')
  })

  test('the carousel moves with its buttons and by scrolling', async ({ page }) => {
    await page.getByRole('tab', { name: '預覽' }).click()
    const carousel = page.locator('.editor-frame:visible .hlx-gallery[data-layout="carousel"]')
    const previous = carousel.getByRole('button', { name: '上一張' })
    const next = carousel.getByRole('button', { name: '下一張' })
    await carousel.scrollIntoViewIfNeeded()
    await expect(previous).toBeDisabled()
    await next.click()
    await expect(carousel.locator('.hlx-gallery-count')).toHaveText('2 / 5')
    await expect.poll(() => carousel.locator('.hlx-gallery-track').evaluate(track => track.scrollLeft)).toBeGreaterThan(0)
    await carousel.locator('.hlx-gallery-track').evaluate((track) => {
      track.scrollTo({ left: track.scrollWidth, behavior: 'instant' })
    })
    await expect(carousel.locator('.hlx-gallery-count')).toHaveText('5 / 5')
    await expect(next).toBeDisabled()
  })

  test('is reached by the arrow keys, and its buttons don\'t pick it', async ({ page }) => {
    const carousel = block(page).nth(2)
    await carousel.getByRole('button', { name: '下一張' }).click()
    await expect(carousel).not.toHaveAttribute('data-selected', 'true')
    await editor(page).locator('> p', { hasText: '輪播圖庫' }).click()
    await page.keyboard.press('ArrowDown')
    await expect(carousel).toHaveAttribute('data-selected', 'true')
    await page.keyboard.press('Delete')
    await expect(block(page)).toHaveCount(2)
    await undo(page)
    await expect(block(page)).toHaveCount(3)
  })
})
