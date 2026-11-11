import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { setTheme } from './theme'

/* The editor page as a workbench: a bar on top, the document, and a panel of settings beside it. */

const bar = (page: Page) => page.locator('.wb-bar')
const panel = (page: Page) => page.locator('.wb-panel')
const editor = (page: Page) => page.locator('.page .editor-frame .hlx-content').first()
const panelTab = (page: Page, name: '設定' | 'JSON') => page.getByRole('tablist', { name: '面板' }).getByRole('tab', { name, exact: true })
const radio = (page: Page, group: string, name: string) => page.getByRole('radiogroup', { name: group }).getByRole('radio', { name, exact: true })

const errors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  await page.route(url => url.protocol.startsWith('http') && url.hostname !== 'localhost', route => route.abort())
  await page.goto('/editor')
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

test('has the bar, the views and the panel', async ({ page }) => {
  const barBox = (await bar(page).boundingBox())!
  expect(barBox.height).toBe(44)
  await expect(bar(page).getByRole('heading', { name: '編輯器', level: 1 })).toBeVisible()
  await expect(bar(page)).toContainText('article')
  expect((await panel(page).boundingBox())!.width).toBe(300)
  await expect(panelTab(page, '設定')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tablist', { name: '檢視' }).getByRole('tab')).toHaveText([
    '編輯',
    '預覽',
    'SSR HTML',
    'LiteXML',
    '比較',
  ])
})

test('sets the layout, accent and document from the panel', async ({ page }) => {
  await radio(page, 'Variant', 'Comment').click()
  await expect(page.locator('.page')).toHaveAttribute('data-variant', 'comment')
  await expect(bar(page)).toContainText('comment')

  await radio(page, '強調色', '墨').click()
  await expect(radio(page, '強調色', '墨')).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('.page')).toHaveAttribute('style', /--hlx-color-accent/)

  // 測試用文件 start closed.
  await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
    element.open = true
  })
  await panel(page).getByRole('button', { name: '載入圖表' }).click()
  await expect(editor(page).locator('.hlx-chart').first()).toBeVisible()
  await panel(page).getByRole('button', { name: '清空文件' }).click()
  await expect(editor(page).locator('.hlx-chart')).toHaveCount(0)
})

test('shows the document live in the JSON tab', async ({ page }) => {
  await editor(page).click()
  await page.keyboard.type('hello')
  await panelTab(page, 'JSON').click()
  await expect(panel(page).locator('details.json pre')).toBeVisible()
  await expect(panel(page).locator('details.json pre')).toContainText('hello')
  await editor(page).click()
  await page.keyboard.type(' again')
  await expect(panel(page).locator('details.json pre')).toContainText('hello again')

  await panelTab(page, '設定').click()
  await expect(panel(page).getByRole('button', { name: '清空文件' })).toBeVisible()
})

test('keeps the bar, toolbar and panel in view while scrolling', async ({ page }) => {
  // 測試用文件 start closed.
  await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
    element.open = true
  })
  await panel(page).getByRole('button', { name: '載入圖表' }).click()
  await expect(editor(page).locator('.hlx-chart').first()).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 400))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

  expect((await bar(page).boundingBox())!.y).toBe(0)
  const toolbar = (await page.locator('.hlx-fixed-toolbar').boundingBox())!
  expect(toolbar.y).toBeGreaterThanOrEqual(44)
  expect(toolbar.y).toBeLessThan(60)
  expect((await panel(page).boundingBox())!.y).toBe(0)
})

test('follows the site\'s theme in every view', async ({ page }) => {
  await setTheme(page, '深色')
  await expect(page.locator('.page')).toHaveAttribute('data-color-scheme', 'dark')
  await page.getByRole('tab', { name: '預覽', exact: true }).click()
  await expect(page.locator('.editor-frame:visible [data-color-scheme="dark"]').first()).toBeAttached()
})

test.describe('at 900px', () => {
  test.use({
    viewport: { width: 900, height: 800 },
  })

  test('puts the panel below the document, and it still works', async ({ page }) => {
    const main = (await page.locator('.wb-main').boundingBox())!
    const box = (await panel(page).boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(main.y + main.height - 1)
    expect(box.width).toBeCloseTo(main.width, 0)
    // 測試用文件 start closed.
    await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
      element.open = true
    })
    await panel(page).getByRole('button', { name: '載入圖表' }).click()
    await expect(editor(page).locator('.hlx-chart').first()).toBeVisible()
  })
})

test.describe('at 375px', () => {
  test.use({
    viewport: { width: 375, height: 812 },
  })

  test('edits with the panel below, without sideways scrolling', async ({ page }) => {
    await editor(page).click()
    await page.keyboard.type('窄')
    await expect(editor(page)).toContainText('窄')
    const main = (await page.locator('.wb-main').boundingBox())!
    expect((await panel(page).boundingBox())!.y).toBeGreaterThanOrEqual(main.y + main.height - 1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  })
})
