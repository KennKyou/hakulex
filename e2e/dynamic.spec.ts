import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { setTheme } from './theme'

/*
 * A dynamic block in a real browser: the demo's sample component, `public/dynamic/counter.js`,
 * loaded by its address into a shadow root. Locators reach into open shadow roots.
 */

const editor = (page: Page) => page.locator('.hlx-content').first()
const box = (page: Page) => editor(page).locator('.hlx-dynamic')
const counter = (page: Page) => box(page).locator('[data-counter]')
const panel = (page: Page) => page.locator('.hlx-block-panel[aria-label="動態元件"]')
const toolbar = (page: Page) => page.locator('.hlx-block-toolbar[aria-label="動態元件"]')

interface Json { type: string, [key: string]: unknown }
async function stored(page: Page): Promise<Json[]> {
  const text = await page.locator('details.json pre').textContent()
  return (JSON.parse(text!) as { root: { children: Json[] } }).root.children
}

const errors = new WeakMap<Page, string[]>()
let loads = 0

test.beforeEach(async ({ page }) => {
  await page.route(url => url.protocol.startsWith('http') && url.hostname !== 'localhost', route => route.abort())
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource'))
      seen.push(message.text())
  })
  loads = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/dynamic/counter.js'))
      loads++
  })
  await page.goto('/editor')
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

async function loadSample(page: Page) {
  // 測試用文件 start closed.
  await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
    element.open = true
  })
  await page.getByRole('button', { name: '載入動態元件' }).click()
  await expect(counter(page)).toBeVisible()
}

test('loads the component into the space kept for it, which works and leaves the document alone', async ({ page }) => {
  await loadSample(page)
  expect(await box(page).evaluate(element => getComputedStyle(element).minHeight)).toBe('160px')
  expect((await box(page).boundingBox())!.height).toBeGreaterThanOrEqual(160)
  await expect(counter(page).locator('strong')).toHaveText('範例計數器')
  await expect(counter(page).locator('output')).toHaveText('3')
  const before = await stored(page)
  await counter(page).getByRole('button', { name: '+1' }).click()
  await expect(counter(page).locator('output')).toHaveText('4')
  expect(await stored(page)).toEqual(before)
  // In its shadow root, the page's styles don't reach it.
  expect(await box(page).locator('.hlx-dynamic-host').evaluate(host => !!host.shadowRoot)).toBe(true)
})

test('tells the component of the theme, without loading it again', async ({ page }) => {
  await loadSample(page)
  // The demo's switch is named for the scheme it shows.
  await setTheme(page, '深色')
  await expect(counter(page)).toHaveAttribute('data-theme', 'dark')
  await expect(counter(page).locator('output')).toHaveText('3')
  expect(loads).toBe(1)
})

test('keeps typing, keys and pasting inside the component to it', async ({ page }) => {
  await loadSample(page)
  const before = await stored(page)
  const note = counter(page).locator('[data-note]')
  await note.click()
  await page.keyboard.type('元件裡的字 abc')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Enter')
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('ControlOrMeta+C')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ControlOrMeta+V')
  await expect(note).toHaveValue('元件裡的字 ab元件裡的字 ab')
  expect(await stored(page)).toEqual(before)
  await expect(toolbar(page)).toHaveCount(0)
})

test('loads only when it comes near the screen', async ({ page }) => {
  await page.evaluate(() => document.querySelector<HTMLElement>('.hlx-content')!.style.setProperty('padding-top', '4000px'))
  // 測試用文件 start closed.
  await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
    element.open = true
  })
  await page.getByRole('button', { name: '載入動態元件' }).click()
  await expect(box(page)).toHaveCount(1)
  await page.waitForTimeout(300)
  expect(loads).toBe(0)
  await box(page).scrollIntoViewIfNeeded()
  await expect(counter(page)).toBeVisible()
  expect(loads).toBe(1)
})

test('is added from the menu and set up in its panel, as it is typed', async ({ page }) => {
  await editor(page).click()
  await page.keyboard.type('/dynamic')
  await page.locator('.hlx-slash-menu [role="option"]').first().click()
  await expect(panel(page)).toBeVisible()
  await expect(box(page)).toContainText('沒有元件網址')
  await expect(panel(page).locator('[data-field="url"]')).toBeFocused()

  await page.keyboard.type('https://cdn.example.net/x.js')
  await page.keyboard.press('Enter')
  await expect(box(page)).toContainText('未允許載入')

  await panel(page).locator('[data-field="url"]').fill('/dynamic/counter.js')
  await panel(page).locator('[data-field="url"]').press('Enter')
  await expect(counter(page)).toBeVisible()
  await panel(page).locator('[data-field="initialHeight"]').fill('240')
  await expect.poll(() => box(page).evaluate(element => getComputedStyle(element).minHeight)).toBe('240px')
  await panel(page).locator('[data-field="props"]').fill('{"start": 5, "label": "五"}')
  await expect(counter(page).locator('output')).toHaveText('5')
  await expect(counter(page).locator('strong')).toHaveText('五')
  expect(loads).toBe(1)

  await toolbar(page).getByRole('button', { name: '編輯' }).click()
  await expect(panel(page)).toHaveCount(0)
  await expect.poll(async () => (await stored(page)).find(node => node.type === 'dynamic')).toMatchObject({
    url: '/dynamic/counter.js',
    initialHeight: 240,
    props: { start: 5, label: '五' },
  })
})

test('is picked by its button, and deleted and restored', async ({ page }) => {
  await loadSample(page)
  await box(page).hover()
  await editor(page).locator('.hlx-dynamic-pick').click()
  await expect(toolbar(page)).toBeVisible()
  await page.keyboard.press('Delete')
  await expect(box(page)).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+Z')
  await expect(counter(page)).toBeVisible()
})

test('runs for readers, in the preview and read-only', async ({ page }) => {
  await loadSample(page)
  await page.getByRole('checkbox', { name: '可編輯' }).uncheck()
  await expect(counter(page)).toBeVisible()
  await expect(editor(page).locator('.hlx-dynamic-pick')).toHaveCount(0)
  await box(page).dblclick()
  await expect(panel(page)).toHaveCount(0)

  await page.getByRole('tab', { name: '預覽' }).click()
  await expect(page.locator('.hlx-renderer [data-counter]')).toBeVisible()
})
