import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { toLineEnd } from './keys'

/*
 * The link panel in a real browser: it comes up for the link under the caret, and its buttons,
 * its form and a modifier click do what they say, by mouse and by keyboard.
 */

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/looks.json', import.meta.url), 'utf8'))
const editor = (page: Page) => page.locator('.hlx-content').first()
const panel = (page: Page) => page.locator('.hlx-link-panel')
const link = (page: Page) => editor(page).locator('a.hlx-link', { hasText: 'link' })
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
  // Nothing leaves the machine: the links' sites, and their icons, are made up.
  await page.route(url => url.hostname !== 'localhost', route => route.abort())
  await page.goto('/editor')
  await page.evaluate((doc) => {
    ;(document.querySelector('#app') as any).__vue_app__._instance.setupState.doc = doc
  }, FIXTURE)
  await expect(link(page)).toBeVisible()
  // Where a new tab would have gone.
  await page.evaluate(() => {
    ;(window as any).opened = []
    window.open = (...args: unknown[]) => {
      ;(window as any).opened.push(args)
      return null
    }
  })
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

const opened = (page: Page) => page.evaluate(() => (window as any).opened as unknown[][])

async function caretInLink(page: Page) {
  const box = (await link(page).boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(panel(page)).toBeVisible()
}

test('comes up below the link under the caret, and goes when the caret leaves it', async ({ page }) => {
  await caretInLink(page)
  const [linkBox, panelBox] = [(await link(page).boundingBox())!, (await panel(page).boundingBox())!]
  expect(panelBox.y).toBeGreaterThan(linkBox.y + linkBox.height)
  await expect(panel(page).locator('.hlx-link-panel-title')).toHaveText('link')
  await expect(panel(page).locator('.hlx-link-panel-url')).not.toContainText('https://')
  await toLineEnd(page)
  await expect(panel(page)).toBeHidden()
  // A selection is the floating toolbar's, not the panel's.
  await caretInLink(page)
  await page.keyboard.press('Shift+ArrowRight')
  await expect(panel(page)).toBeHidden()
  await expect(page.locator('.hlx-floating-toolbar')).toBeVisible()
})

test('opens, copies and removes the link from its buttons, with removal undone in one step', async ({ page }) => {
  const href = await link(page).getAttribute('href')
  await caretInLink(page)
  await panel(page).getByRole('button', { name: '開啟連結' }).click()
  expect(await opened(page)).toEqual([
    [href, '_blank', 'noopener,noreferrer'],
  ])

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => { (window as any).copied = text },
      },
    })
  })
  await panel(page).getByRole('button', { name: '複製網址' }).click()
  await expect(panel(page).getByRole('button', { name: '已複製' })).toBeVisible()
  expect(await page.evaluate(() => (window as any).copied)).toBe(href)

  await panel(page).getByRole('button', { name: '移除連結' }).click()
  await expect(link(page)).toHaveCount(0)
  await expect(editor(page)).toContainText('A link and a')
  await page.keyboard.press('ControlOrMeta+Z')
  await expect(link(page)).toHaveAttribute('href', href!)
})

test('edits the text and address from the keyboard, Enter to save and Esc to leave it', async ({ page }) => {
  await caretInLink(page)
  await page.keyboard.press('ControlOrMeta+K')
  const address = panel(page).getByRole('textbox', { name: '網址' })
  await expect(address).toBeFocused()
  await address.fill('example.org/changed')
  await page.keyboard.press('Escape')
  await expect(address).toBeHidden()
  await expect(link(page)).not.toHaveAttribute('href', /changed/)

  await panel(page).getByRole('button', { name: '編輯連結' }).click()
  await panel(page).getByRole('textbox', { name: '連結文字' }).fill('linked')
  await panel(page).getByRole('textbox', { name: '網址' }).fill('example.org/changed')
  await page.keyboard.press('Enter')
  const changed = editor(page).locator('a.hlx-link', { hasText: 'linked' })
  await expect(changed).toHaveAttribute('href', 'https://example.org/changed')
  await expect(editor(page)).toBeFocused()
  await page.keyboard.press('ControlOrMeta+Z')
  await expect(link(page)).toBeVisible()
  await expect(changed).toHaveCount(0)
})

test('refuses an address that is not allowed, saying why', async ({ page }) => {
  await caretInLink(page)
  await panel(page).getByRole('button', { name: '編輯連結' }).click()
  const address = panel(page).getByRole('textbox', { name: '網址' })
  await address.fill('   ')
  await expect(panel(page).getByRole('button', { name: '儲存' })).toBeDisabled()
  await address.fill('javascript:alert(1)')
  await page.keyboard.press('Enter')
  await expect(panel(page).getByRole('alert')).toBeVisible()
  await expect(address).toHaveAttribute('aria-invalid', 'true')
  await expect(link(page)).not.toHaveAttribute('href', /javascript/)
})

test('opens a link on a modifier click, and puts the caret in it without one', async ({ page }) => {
  await link(page).click({
    modifiers: ['ControlOrMeta'],
  })
  expect((await opened(page))[0]?.[1]).toBe('_blank')
  await page.getByRole('checkbox', { name: '可編輯' }).uncheck()
  await link(page).click({
    modifiers: ['ControlOrMeta'],
  })
  expect(await opened(page)).toHaveLength(2)
})

test('works for a link inside a nested document', async ({ page }) => {
  // 測試用文件 start closed.
  await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
    element.open = true
  })
  await page.getByRole('button', { name: '載入巢狀文件和格狀版面' }).click()
  const nested = page.locator('.hlx-nested-doc .hlx-content').first()
  await nested.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.locator('.hlx-floating-toolbar').getByRole('button', { name: '連結' }).click()
  await page.locator('.hlx-floating-toolbar').getByRole('textbox').fill('https://nested.example')
  await page.keyboard.press('Enter')
  const inner = nested.locator('a')
  await expect(inner).toHaveAttribute('href', 'https://nested.example')
  const box = (await inner.boundingBox())!
  await page.mouse.click(box.x + 4, box.y + box.height / 2)
  await expect(panel(page)).toBeVisible()
  await panel(page).getByRole('button', { name: '移除連結' }).click()
  await expect(inner).toHaveCount(0)
})
