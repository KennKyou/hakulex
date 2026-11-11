import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { nodeTypes } from '../demo/src/site/nodes'
import { packagesOf, packagesPath } from '../demo/src/site/packages'
import { setTheme } from './theme'

/* The home page: what hakulex is, an editor to try, and the way to everything else. */

const home = (page: Page) => page.locator('.home')
const editor = (page: Page) => home(page).locator('.hlx-content').first()
const nav = (page: Page) => page.getByRole('navigation', { name: '網站導覽' })

const errors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  await page.route(url => url.protocol.startsWith('http') && url.hostname !== 'localhost', route => route.abort())
  await page.goto('/')
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

test('says what hakulex is and leads on', async ({ page }) => {
  await expect(page).toHaveTitle('hakulex｜給 Vue 3 的富文本編輯器')
  await expect(home(page).locator('.home-hero h1')).toContainText('從編輯到呈現')
  await expect(home(page).locator('.home-lead')).not.toBeEmpty()
  // The hero leads with trying it; the same link closes the page.
  const actions = home(page).locator('.home-actions').getByRole('link')
  await expect(actions).toHaveText(['試用編輯器', '開始使用', '查看 GitHub'])
  await expect(actions.nth(0)).toHaveAttribute('href', '/editor')
  await expect(actions.nth(1)).toHaveAttribute('href', '/packages/editor')
  await expect(home(page).locator('.home-window .hlx-fixed-toolbar')).toBeVisible()
  await expect(home(page).locator('.home-cta').getByRole('link', { name: '試用編輯器' })).toHaveAttribute('href', '/editor')
  await expect(home(page).locator('.home-cta').getByRole('link', { name: '開始使用' })).toHaveAttribute('href', '/packages/editor')
  await expect(home(page).locator('.home-cta .home-install')).toBeVisible()
  await expect(nav(page).locator('[aria-current="page"]')).toHaveCount(0)
})

test('has an editor to try, with its menus', async ({ page }) => {
  await editor(page).locator('p').last().click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('試試看')
  await expect(editor(page)).toContainText('試試看')

  await page.keyboard.press('Enter')
  await page.keyboard.type('/')
  await expect(page.locator('.hlx-slash-menu [role="option"]').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Backspace')

  await editor(page).locator('p').first().dblclick({
    position: { x: 24, y: 10 },
  })
  await expect(page.locator('.hlx-floating-toolbar')).toBeVisible()
})

test('counts the nodes and plugins, and goes to them without reloading', async ({ page }) => {
  await expect(home(page).getByText(`${nodeTypes.length} 種節點`)).toBeVisible()
  await expect(home(page).locator('.home-chips a[href^="/nodes/"]')).toHaveCount(nodeTypes.length)
  await expect(home(page).locator(`.plugin-demo-all[href="${packagesPath('plugin')}"]`)).toContainText(`全部 ${packagesOf('plugin').length} 個外掛`)
  for (const path of [
    '/editor',
    '/presets',
    '/nodes',
    '/plugins',
    '/packages',
    '/charts',
    '/tokens',
  ])
    await expect(home(page).locator(`.home-footer a[href="${path}"]`)).toHaveCount(1)
  // Grouped as the sidebar is, and closed with the credits and the license.
  await expect(home(page).locator('.home-footer nav strong')).toHaveText(['試玩', '參考'])
  await expect(home(page).locator('.home-footer-end')).toContainText('MIT 授權')
  await expect(home(page).locator('.home-footer-end a[href$="/NOTICE"]')).toHaveText('致謝')

  await page.evaluate(() => {
    (window as unknown as { marker: string }).marker = 'same page'
  })
  await home(page).locator('.home-footer a[href="/nodes"]').click()
  await expect(page).toHaveURL(/\/nodes$/)
  expect(await page.evaluate(() => (window as unknown as { marker?: string }).marker)).toBe('same page')
})

test('shows how to install it, and that it isn\'t published yet', async ({ page }) => {
  const install = home(page).locator('.home-hero .home-install')
  await expect(install).toContainText('pnpm add @hakulex/editor')
  await expect(install).toContainText('尚未發布到 npm')
})

test('follows the dark theme', async ({ page }) => {
  await setTheme(page, '深色')
  await expect(home(page).locator('.home-hero-editor .hlx-editor')).toHaveAttribute('data-color-scheme', 'dark')
})

test.describe('at 375px', () => {
  test.use({
    viewport: { width: 375, height: 812 },
  })

  test('has no sideways scrolling', async ({ page }) => {
    await expect(editor(page)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  })
})
