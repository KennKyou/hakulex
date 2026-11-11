import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { chartKinds } from '../demo/src/site/charts'
import { nodeTypes } from '../demo/src/site/nodes'
import { packagesOf } from '../demo/src/site/packages'
import { presets } from '../demo/src/site/presets'
import { toLineEnd } from './keys'
import { setTheme, themeButton } from './theme'

/* The frame around the pages: the side navigation, search and the color theme. */

const { version } = JSON.parse(readFileSync(new URL('../packages/editor/package.json', import.meta.url), 'utf8')) as { version: string }

const side = (page: Page) => page.locator('.site-side')
const nav = (page: Page) => page.getByRole('navigation', { name: '網站導覽' })
const section = (page: Page, path: string) => nav(page).locator(`.site-nav-section[href="${path}"]`)
const leaves = (page: Page) => nav(page).locator('.site-nav-leaf')
const dialog = (page: Page) => page.getByRole('dialog', { name: '搜尋' })
const input = (page: Page) => dialog(page).getByRole('textbox')
const site = (page: Page) => page.locator('.site')

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

test.describe('the side navigation', () => {
  test('has its groups and counts, with nothing opened on the editor', async ({ page }) => {
    await page.goto('/editor')
    expect((await side(page).boundingBox())!.width).toBe(260)
    await expect(nav(page).locator('.site-nav-label')).toHaveText(['試玩', '參考'])
    const counts: [string, number][] = [
      ['/presets', presets.length],
      ['/nodes', nodeTypes.length],
      ['/plugins', packagesOf('plugin').length],
      ['/packages', packagesOf('package').length],
      ['/charts', chartKinds.length],
    ]
    for (const [path, count] of counts)
      await expect(section(page, path).locator('.site-nav-count')).toHaveText(String(count))
    await expect(leaves(page)).toHaveCount(0)
    await expect(section(page, '/editor')).toHaveAttribute('aria-current', 'page')
    await expect(section(page, '/tokens')).toBeVisible()
  })

  test('opens only the section it is in, and marks one page', async ({ page }) => {
    await page.goto('/nodes/poll')
    await expect(leaves(page)).toHaveCount(nodeTypes.length + 1)
    await expect(nav(page).locator('.site-nav-leaf[href="/nodes"]')).toHaveText('概覽')
    const poll = nav(page).locator('.site-nav-leaf[href="/nodes/poll"]')
    await expect(poll).toHaveAttribute('aria-current', 'page')
    await expect(poll).toBeInViewport({ ratio: 1 })
    await expect(nav(page).locator('[aria-current="page"]')).toHaveCount(1)
    await expect(nav(page).locator('a[href="/plugins/table"]')).toHaveCount(0)

    await section(page, '/plugins').click()
    await expect(page).toHaveURL(/\/plugins$/)
    await expect(nav(page).locator('.site-nav-leaf[href="/plugins/table"]')).toBeVisible()
    await expect(nav(page).locator('a[href="/nodes/poll"]')).toHaveCount(0)
  })

  test('has the name, the version and a link to the repository', async ({ page }) => {
    await page.goto('/nodes')
    await expect(side(page).getByRole('link', { name: 'hakulex', exact: true })).toHaveAttribute('href', '/')
    await expect(side(page)).toContainText(`v${version}`)
    await expect(side(page).getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/KennKyou/hakulex')
  })

  test.describe('on a narrow screen', () => {
    test.use({
      viewport: { width: 375, height: 812 },
    })

    test('has only the seven ways in, without counts or pages', async ({ page }) => {
      await page.goto('/nodes/poll')
      await expect(nav(page).getByRole('link')).toHaveText([
        '編輯器',
        '範例文件',
        '節點',
        '外掛',
        '套件',
        '圖表',
        'Token',
      ], { useInnerText: true })
      await expect(leaves(page).first()).toBeHidden()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
    })
  })
})

test.describe('search', () => {
  test('opens from the keyboard and closes, returning focus', async ({ page }) => {
    await page.goto('/nodes')
    await page.locator('.node-tile').first().focus()
    await page.keyboard.press('ControlOrMeta+K')
    await expect(dialog(page)).toBeVisible()
    await expect(input(page)).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.locator('.node-tile').first()).toBeFocused()
  })

  test('opens from its button and closes on a click outside', async ({ page }) => {
    await page.goto('/nodes')
    await side(page).getByRole('button', { name: /搜尋/ }).click()
    await expect(dialog(page)).toBeVisible()
    await page.mouse.click(5, 5)
    await expect(dialog(page)).toHaveCount(0)
  })

  test('finds a page and goes there without reloading', async ({ page }) => {
    await page.goto('/nodes')
    await page.evaluate(() => {
      (window as unknown as { marker: string }).marker = 'same page'
    })
    await page.keyboard.press('ControlOrMeta+K')
    await input(page).fill('投票')
    const options = dialog(page).getByRole('option')
    await expect(options.first()).toContainText('投票')
    await expect(options.first()).toContainText('節點')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/nodes\/poll$/)
    await expect(dialog(page)).toHaveCount(0)
    expect(await page.evaluate(() => (window as unknown as { marker?: string }).marker)).toBe('same page')
  })

  test('says so when nothing is found', async ({ page }) => {
    await page.goto('/nodes')
    await page.keyboard.press('ControlOrMeta+K')
    await input(page).fill('絕對找不到的字')
    await expect(dialog(page).getByRole('option')).toHaveCount(0)
    await expect(dialog(page)).toContainText('沒有結果')
  })

  test('leaves the shortcut to the editor when typing there', async ({ page }) => {
    await page.goto('/nodes/spoiler')
    await page.getByRole('tab', { name: '編輯', exact: true }).click()
    const editor = page.locator('.node-sample [contenteditable="true"]').first()
    await editor.click()
    await toLineEnd(page)
    await page.keyboard.press('Shift+ArrowLeft')
    await page.keyboard.press('ControlOrMeta+K')
    await expect(page.locator('.hlx-link-panel, .hlx-floating-toolbar').first()).toBeVisible()
    await expect(dialog(page)).toHaveCount(0)
  })
})

test.describe('the color theme', () => {
  test.describe('with the system dark', () => {
    test.use({ colorScheme: 'dark' })

    test('follows the system at first', async ({ page }) => {
      await page.goto('/nodes')
      await expect(themeButton(page)).toHaveAccessibleName(/系統/)
      await expect(site(page)).toHaveAttribute('data-color-scheme', 'dark')
    })
  })

  test('remembers the choice across a reload', async ({ page }) => {
    await page.goto('/nodes')
    await expect(site(page)).toHaveAttribute('data-color-scheme', 'light')
    await setTheme(page, '深色')
    await expect(site(page)).toHaveAttribute('data-color-scheme', 'dark')
    await page.reload()
    await expect(site(page)).toHaveAttribute('data-color-scheme', 'dark')
    await expect(themeButton(page)).toHaveAccessibleName(/深色/)
  })

  test('takes the playground along', async ({ page }) => {
    await page.goto('/editor')
    await setTheme(page, '深色')
    await expect(site(page)).toHaveAttribute('data-color-scheme', 'dark')
    await expect(page.locator('.page')).toHaveAttribute('data-color-scheme', 'dark')
    const color = await page.locator('.page').evaluate(element => getComputedStyle(element).backgroundColor)
    expect(color).not.toBe('rgb(255, 255, 255)')
  })
})
