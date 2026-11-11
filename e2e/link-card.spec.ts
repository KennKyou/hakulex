import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const editor = (page: Page) => page.locator('.hlx-content').first()
const undo = (page: Page) => page.keyboard.press('ControlOrMeta+Z')
const dialog = (page: Page) => page.locator('.hlx-block-dialog')
const card = (page: Page) => editor(page).locator('.hlx-link-card')

interface Json { type: string, url?: string, title?: string }
async function stored(page: Page): Promise<Json[]> {
  const text = await page.locator('details.json pre').textContent()
  return (JSON.parse(text!) as { root: { children: Json[] } }).root.children
}

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
  await page.goto('/editor')
  await editor(page).click()
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

async function insert(page: Page, url: string, title: string) {
  await page.keyboard.type('/card')
  await expect(page.locator('.hlx-slash-menu [role="option"]')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(dialog(page)).toBeVisible()
  await dialog(page).locator('[data-field="url"]').fill(url)
  await dialog(page).locator('[data-field="title"]').fill(title)
  await dialog(page).getByRole('button', { name: '儲存' }).click()
  await expect(dialog(page)).toHaveCount(0)
}

test('inserts a card from the menu, as one undo step', async ({ page }) => {
  await insert(page, 'https://example.com/page', '一張卡片')
  await expect(card(page)).toContainText('一張卡片')
  // : the title and description, no line for the address.
  await expect(card(page)).not.toContainText('example.com/page')
  await expect.poll(async () => (await stored(page)).find(node => node.type === 'link-card')).toMatchObject({
    url: 'https://example.com/page',
    title: '一張卡片',
  })
  await undo(page)
  await expect(card(page)).toHaveCount(0)
})

test('a click selects it without leaving the page, and Enter edits it in its panel', async ({ page }) => {
  await insert(page, 'https://example.com/page', '一張卡片')
  const before = page.url()
  await card(page).click()
  await expect(editor(page).locator('.hlx-block-editor[data-selected]')).toBeVisible()
  expect(page.url()).toBe(before)
  expect(page.context().pages()).toHaveLength(1)
  await page.keyboard.press('Enter')
  const panel = page.locator('.hlx-block-panel[aria-label="連結卡片"]')
  await panel.locator('[data-field="title"]').fill('改過的卡片')
  await expect(card(page)).toContainText('改過的卡片')
  await page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' }).click()
  await expect(panel).toHaveCount(0)
  await expect(card(page)).toContainText('改過的卡片')
})

test('is reached by the arrow keys, and deleted and restored as a block', async ({ page }) => {
  await page.keyboard.type('前')
  await page.keyboard.press('Enter')
  await insert(page, 'https://example.com/page', '一張卡片')
  await page.keyboard.type('後')
  await page.keyboard.press('ArrowUp')
  await expect(editor(page).locator('.hlx-block-editor[data-selected]')).toBeVisible()
  await page.keyboard.press('Delete')
  await expect(card(page)).toHaveCount(0)
  await expect(editor(page)).toContainText('前')
  await expect(editor(page)).toContainText('後')
  await undo(page)
  await expect(card(page)).toContainText('一張卡片')
})

test('is a link when read-only and in the preview', async ({ page }) => {
  await insert(page, 'https://example.com/page', '一張卡片')
  await page.getByRole('checkbox', { name: '可編輯' }).uncheck()
  await expect(card(page)).toHaveAttribute('href', 'https://example.com/page')
  await expect(card(page)).toHaveAttribute('rel', 'noopener noreferrer')
  await page.getByRole('checkbox', { name: '可編輯' }).check()
  await page.getByRole('tab', { name: '預覽' }).click()
  await expect(page.locator('a.hlx-link-card:visible')).toHaveAttribute('target', '_blank')
})

test('shows the demo card with its stored data', async ({ page }) => {
  // 測試用文件 start closed.
  await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
    element.open = true
  })
  await page.getByRole('button', { name: '載入連結卡片和繞排圖片' }).click()
  await expect(card(page).first()).toContainText('Lexical')
  await expect(card(page).first()).toContainText('An extensible')
  await expect(card(page).first().locator('.hlx-link-card-image')).toHaveCount(1)
  // A 40px picture at the start, beside the title and description.
  const picture = (await card(page).first().locator('.hlx-link-card-image').boundingBox())!
  const box = (await card(page).first().boundingBox())!
  expect([picture.width, picture.height]).toEqual([40, 40])
  expect(picture.x - box.x).toBe(17)
  expect(box.height).toBeLessThan(120)
})
