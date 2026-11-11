import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { setTheme } from './theme'

/*
 * The tokens in a real browser: their values, a site's own colors reaching everything the
 * editor shows over the page, and the demo's palettes.
 */

const editor = (page: Page) => page.locator('.hlx-editor').first()
const content = (page: Page) => page.locator('.hlx-content').first()
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
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

/** A token's value where it is used: custom properties are substituted when computed. */
function token(page: Page, selector: string, name: string) {
  return page.locator(selector).first().evaluate((element, variable) => getComputedStyle(element).getPropertyValue(variable).trim(), name)
}
async function loadCard(page: Page) {
  // 測試用文件 start closed.
  await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
    element.open = true
  })
  await page.getByRole('button', { name: '載入連結卡片和繞排圖片' }).click()
  await expect(content(page).locator('.hlx-link-card')).toBeVisible()
}
async function openCardPanel(page: Page) {
  await content(page).locator('.hlx-link-card').first().click()
  await page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' }).click()
  await expect(page.locator('.hlx-block-panel')).toBeVisible()
}

test('has its values, light and dark', async ({ page }) => {
  expect(await token(page, '.hlx-editor', '--hlx-color-text-secondary')).toBe('#404040')
  expect(await token(page, '.hlx-editor', '--hlx-flow-paragraph')).toBe('1.25em')
  expect(await token(page, '.hlx-editor', '--hlx-font-size-code')).toBe('0.8125em')
  await setTheme(page, '深色')
  await expect.poll(() => token(page, '.hlx-editor', '--hlx-color-text')).toBe('#ededed')
  expect(await token(page, '.hlx-editor', '--hlx-color-bg')).toBe('#0a0a0a')
  // The interface follows: its ring is made of the accent.
  expect(await token(page, '.hlx-editor', '--hlx-chrome-ring')).toContain('#60a5fa')
})

test('spaces the content with its rhythm, in the editor and the preview', async ({ page }) => {
  await loadCard(page)
  const gap = () => content(page).locator('p.hlx-paragraph').first().evaluate(element => getComputedStyle(element).marginBottom)
  expect(await gap()).toBe('20px')
  await page.getByRole('tab', { name: '預覽' }).click()
  expect(await page.locator('.hlx-renderer p.hlx-paragraph').first().evaluate(element => getComputedStyle(element).marginBottom)).toBe('20px')
})

test('takes a site\'s own colors from --hlx-host-*, everywhere', async ({ page }) => {
  await page.evaluate(() => document.documentElement.style.setProperty('--hlx-host-color-accent', '#171717'))
  await loadCard(page)
  await openCardPanel(page)
  expect(await token(page, '.hlx-editor', '--hlx-color-accent')).toBe('#171717')
  expect(await token(page, '.hlx-block-toolbar', '--hlx-color-accent')).toBe('#171717')
  expect(await token(page, '.hlx-block-panel', '--hlx-color-accent')).toBe('#171717')
  // What the site didn't set stays as it was.
  expect(await token(page, '.hlx-block-panel', '--hlx-color-text')).toBe('#171717')
  expect(await token(page, '.hlx-block-panel', '--hlx-color-text-secondary')).toBe('#404040')
})

test.describe('the demo\'s accents', () => {
  const swatches = (page: Page) => page.getByRole('radiogroup', { name: '強調色' })
  for (const [name, accent, darkAccent] of [
    ['綠', '#16a34a', '#4ade80'],
    ['粉紅', '#db2777', '#f472b6'],
    ['琥珀', '#d97706', '#fbbf24'],
    ['紫', '#7c3aed', '#a78bfa'],
    ['墨', '#171717', '#e5e5e5'],
  ]) {
    test(`${name} colors the editor, its panels and the preview, light and dark, leaving the background`, async ({ page }) => {
      await loadCard(page)
      await swatches(page).getByRole('radio', { name, exact: true }).click()
      expect(await token(page, '.hlx-editor', '--hlx-color-accent')).toBe(accent)
      expect(await token(page, '.hlx-editor', '--hlx-color-link')).toBe(accent)
      expect(await editor(page).getAttribute('style') ?? '').not.toContain('--hlx-color-bg')
      await openCardPanel(page)
      expect(await token(page, '.hlx-block-panel', '--hlx-color-accent')).toBe(accent)
      // The switch is outside the panel, so pressing it puts the panel away: open it again.
      await setTheme(page, '深色')
      await expect.poll(() => token(page, '.hlx-editor', '--hlx-color-accent')).toBe(darkAccent)
      await openCardPanel(page)
      expect(await token(page, '.hlx-block-panel', '--hlx-color-accent')).toBe(darkAccent)
      await page.getByRole('tab', { name: '預覽' }).click()
      expect(await token(page, '.hlx-renderer', '--hlx-color-accent')).toBe(darkAccent)
    })
  }

  test('takes a custom accent, and 預設 puts everything back', async ({ page }) => {
    await page.getByLabel('自訂強調色').evaluate((input: HTMLInputElement) => {
      input.value = '#ff0000'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(await token(page, '.hlx-editor', '--hlx-color-accent')).toBe('#ff0000')
    expect(await token(page, '.hlx-editor', '--hlx-color-link')).toBe('#ff0000')
    await swatches(page).getByRole('radio', { name: '墨', exact: true }).click()
    await swatches(page).getByRole('radio', { name: '預設', exact: true }).click()
    expect(await token(page, '.hlx-editor', '--hlx-color-accent')).toBe('#2563eb')
    expect(await editor(page).getAttribute('style') ?? '').not.toContain('--hlx')
  })
})

test('lays out the chat and note variants', async ({ page }) => {
  await loadCard(page)
  await page.getByRole('radiogroup', { name: 'Variant' }).getByRole('radio', { name: 'Chat', exact: true }).click()
  expect(await content(page).evaluate(element => getComputedStyle(element).fontSize)).toBe('15px')
  expect(await content(page).locator('p.hlx-paragraph').first().evaluate(element => getComputedStyle(element).marginBottom)).toBe('11.25px')
  await page.getByRole('radiogroup', { name: 'Variant' }).getByRole('radio', { name: 'Note', exact: true }).click()
  expect(await content(page).evaluate(element => getComputedStyle(element).fontFamily)).toContain('Noto Serif TC')
})
