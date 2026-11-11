import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/*
 * The demo as a site: a navigation beside the pages, the playground at / and /editor, and
 * unknown addresses back at /.
 */

const nav = (page: Page) => page.getByRole('navigation', { name: '網站導覽' })
const editorLink = (page: Page) => nav(page).getByRole('link', { name: '編輯器' })
const playground = (page: Page) => page.locator('.page .editor-frame .hlx-content').first()

const errors = new WeakMap<Page, string[]>()

test.beforeEach(({ page }) => {
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

test('/editor shows the playground beside the site navigation', async ({ page }) => {
  await page.goto('/editor')
  await expect(page.getByRole('link', { name: 'hakulex', exact: true })).toHaveAttribute('href', '/')
  await expect(editorLink(page)).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('tab', { name: '編輯', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '清空文件' })).toBeVisible()

  // The navigation sits to the left of the playground, which keeps its width.
  const navBox = (await nav(page).boundingBox())!
  const pageBox = (await page.locator('.page').boundingBox())!
  expect(navBox.x + navBox.width).toBeLessThanOrEqual(pageBox.x)
  expect(pageBox.width).toBeLessThanOrEqual(760)
  expect(pageBox.width).toBeGreaterThan(700)
})

test('the navigation comes back to /editor without reloading the page', async ({ page }) => {
  await page.goto('/editor')
  await page.getByRole('button', { name: '清空文件' }).click()
  await playground(page).click()
  await page.keyboard.type('還在')
  await page.evaluate(() => {
    (window as unknown as { marker: string }).marker = 'same page'
  })

  await nav(page).locator('.site-nav-section[href="/nodes"]').click()
  await expect(page).toHaveURL(/\/nodes$/)
  await editorLink(page).click()
  await expect(page).toHaveURL(/\/editor$/)
  await expect(editorLink(page)).toHaveAttribute('aria-current', 'page')
  expect(await page.evaluate(() => (window as unknown as { marker?: string }).marker)).toBe('same page')
  await expect(page.getByRole('tab', { name: '編輯', exact: true })).toBeVisible()
})

test('/editor opens the playground directly', async ({ page }) => {
  await page.goto('/editor')
  await expect(editorLink(page)).toHaveAttribute('aria-current', 'page')
  await playground(page).click()
  await page.keyboard.type('hello')
  await expect(playground(page)).toContainText('hello')
})

test('an unknown address goes to /', async ({ page }) => {
  await page.goto('/nope')
  await expect(page).toHaveURL(/\/$/)
  await expect(nav(page)).toBeVisible()
  await expect(page.locator('.home')).toBeVisible()
})

test.describe('on a narrow screen', () => {
  test.use({
    viewport: { width: 375, height: 812 },
  })

  test('puts the navigation above the playground, without sideways scrolling', async ({ page }) => {
    await page.goto('/editor')
    const navBox = (await nav(page).boundingBox())!
    const pageBox = (await page.locator('.page').boundingBox())!
    expect(navBox.y + navBox.height).toBeLessThanOrEqual(pageBox.y)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)

    await page.getByRole('button', { name: '清空文件' }).click()
    await playground(page).click()
    await page.keyboard.type('窄')
    await expect(playground(page)).toContainText('窄')
  })
})
