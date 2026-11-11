import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { setTheme } from './theme'

/* The look the document pages share: their heading, controls, table of contents and theme. */

const article = (page: Page) => page.locator('.doc-article')
const title = (page: Page) => page.locator('h1.doc-title')
const toc = (page: Page) => page.locator('.doc-toc')
const samples = (page: Page) => page.locator('.node-sample')

const errors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  await page.route(url => url.protocol.startsWith('http') && url.hostname !== 'localhost', route => route.abort())
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

test.describe('at 1440px', () => {
  test.use({
    viewport: { width: 1440, height: 900 },
  })

  const pages: [string, string, number][] = [
    ['/nodes/poll', '投票', 760],
    ['/plugins/table', '表格操作', 760],
    ['/charts/bar', '長條圖', 760],
    ['/presets/notes', '生活筆記', 760],
    ['/tokens', 'Token', 1080],
    ['/nodes', '節點', 1080],
    ['/plugins', '外掛', 1080],
    ['/packages', '套件', 1080],
    ['/charts', '圖表', 1080],
    ['/presets', '範例文件', 1080],
  ]

  for (const [path, name, width] of pages) {
    test(`${path} has the shared heading and width`, async ({ page }) => {
      await page.goto(path)
      await expect(title(page)).toHaveText(name)
      await expect(page.locator('.doc-crumbs')).not.toBeEmpty()
      const size = await title(page).evaluate(element => getComputedStyle(element).fontSize)
      expect(size).toBe('30px')
      expect((await article(page).boundingBox())!.width).toBeLessThanOrEqual(width)
    })
  }
})

test('the layout is a set of radios and the views are tabs, by mouse and keyboard', async ({ page }) => {
  await page.goto('/nodes/poll')
  const group = page.getByRole('radiogroup', { name: '排版' })
  await expect(group.getByRole('radio', { name: 'Article', exact: true })).toHaveAttribute('aria-checked', 'true')

  await group.getByRole('radio', { name: 'Note', exact: true }).click()
  await expect(samples(page).locator('[data-variant="note"]').first()).toBeVisible()

  await group.getByRole('radio', { name: 'Note', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(group.getByRole('radio', { name: 'Comment', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(group.getByRole('radio', { name: 'Comment', exact: true })).toBeFocused()

  const edit = page.getByRole('tab', { name: '編輯', exact: true })
  await edit.focus()
  await page.keyboard.press('Enter')
  await expect(edit).toHaveAttribute('aria-selected', 'true')
  await expect(samples(page).locator('[contenteditable="true"]').first()).toBeVisible()
})

test('samples follow the dark theme, read and edited', async ({ page }) => {
  await page.goto('/nodes/poll')
  await setTheme(page, '深色')
  await expect(samples(page).locator('[data-color-scheme="dark"]').first()).toBeVisible()
  await page.getByRole('tab', { name: '編輯', exact: true }).click()
  await expect(samples(page).locator('[data-color-scheme="dark"]').first()).toBeVisible()
})

test.describe('the table of contents', () => {
  test('lists the page\'s own sections and goes to one', async ({ page }) => {
    await page.goto('/packages/editor')
    const links = toc(page).getByRole('link')
    await expect(links).toHaveText(['展示', '安裝', '使用'])
    await links.nth(2).click()
    await expect(page.locator('.pkg-usage .doc-h2')).toBeInViewport()
    await expect(links.nth(2)).toHaveAttribute('aria-current', 'true')
  })

  test('leaves out the headings inside samples', async ({ page }) => {
    await page.goto('/nodes/heading')
    await expect(toc(page).getByRole('link')).toHaveText(['預覽', '序列化的 JSON'])
  })

  test.describe('on a smaller window', () => {
    test.use({
      viewport: { width: 1100, height: 800 },
    })

    test('is hidden', async ({ page }) => {
      await page.goto('/packages/editor')
      await expect(title(page)).toBeVisible()
      await expect(toc(page)).toBeHidden()
    })
  })
})
