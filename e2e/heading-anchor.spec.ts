import type { Locator, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

/* A heading links to itself from its left for readers, shown on hover or focus. */

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/looks.json', import.meta.url), 'utf8'))
const errors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  page.on('console', (message) => {
    // A link's site icon is looked for in a few places, and a missing one fails to load.
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource'))
      seen.push(message.text())
  })
  // Nothing leaves the machine: the document's links go to made-up sites.
  await page.route(url => url.hostname !== 'localhost', route => route.abort())
  await page.goto('/editor')
  await page.evaluate((doc) => {
    ;(document.querySelector('#app') as any).__vue_app__._instance.setupState.doc = doc
  }, FIXTURE)
  await expect(page.locator('.hlx-content .hlx-h2').first()).toBeVisible()
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

const opacity = (locator: Locator) => locator.evaluate(element => getComputedStyle(element).opacity)

test('shows faintly on the heading\'s hover, fully on its own or on focus, and links to the heading', async ({ page, browserName }) => {
  await page.getByRole('tab', { name: '預覽' }).click()
  const title = page.locator('.hlx-renderer .hlx-h2').first()
  const anchor = title.getByRole('link', { name: '連結到這個標題' })
  await expect(anchor).toHaveAttribute('href', `#${await title.getAttribute('id')}`)
  expect(await opacity(anchor)).toBe('0')
  await title.hover()
  await expect.poll(() => opacity(anchor)).toBe('0.5')
  const [titleBox, anchorBox] = [(await title.boundingBox())!, (await anchor.boundingBox())!]
  expect(Math.round(titleBox.x - anchorBox.x)).toBe(20)
  await anchor.hover()
  await expect.poll(() => opacity(anchor)).toBe('1')
  await page.mouse.move(0, 0)
  await expect.poll(() => opacity(anchor)).toBe('0')
  // From the keyboard. Safari's Tab skips links unless asked to; Option+Tab is its way to them.
  const tab = browserName === 'webkit'
    ? 'Alt+Tab'
    : 'Tab'
  await anchor.focus()
  await page.keyboard.press(`Shift+${tab}`)
  await page.keyboard.press(tab)
  await expect(anchor).toBeFocused()
  await expect.poll(() => opacity(anchor)).toBe('1')
  await anchor.click()
  await expect(page).toHaveURL(new RegExp(`#${await title.getAttribute('id')}$`))
})

test('is not in the editor', async ({ page }) => {
  await expect(page.locator('.hlx-content .hlx-heading-anchor')).toHaveCount(0)
})
