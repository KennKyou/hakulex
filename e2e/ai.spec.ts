import type { Page } from '@playwright/test'
import process from 'node:process'
import { expect, test } from '@playwright/test'
import { toLineEnd } from './keys'
import { setTheme } from './theme'

/*
 * The whole AI demo at /ai: the full editor, the review in it and the chat beside it, on a
 * document that reads like a real one. The model answers from a script, so nothing leaves the
 * page. These run in all three browsers: this is where every plugin meets the review.
 */

const editor = (page: Page) => page.locator('.ai-frame .hlx-content').first()
const cards = (page: Page) => page.locator('.ai-frame .hlx-agent-card')
const chat = (page: Page) => page.locator('.ai-chat .hlx-chat')
const replies = (page: Page) => chat(page).locator('.hlx-chat-message[data-role="assistant"]')
const input = (page: Page) => chat(page).getByRole('textbox', { name: '給 AI 的訊息' })
const send = (page: Page) => chat(page).getByRole('button', { name: '送出' })
const suggestions = (page: Page) => chat(page).locator('.hlx-chat-suggestion')
const block = (page: Page, words: string) => editor(page).locator('> *').filter({ hasText: words }).first()
function undo(page: Page) {
  return page.keyboard.press(process.platform === 'darwin'
    ? 'Meta+z'
    : 'Control+z')
}

const seen = new WeakMap<Page, { errors: string[], outside: string[] }>()

test.beforeEach(async ({ page }) => {
  const record = { errors: [] as string[], outside: [] as string[] }
  seen.set(page, record)
  page.on('pageerror', error => record.errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      record.errors.push(message.text())
  })
  // Anything that tries to leave the page is stopped, and counted.
  await page.route(url => url.protocol.startsWith('http') && url.hostname !== 'localhost', (route) => {
    record.outside.push(route.request().url())
    return route.abort()
  })
})

test.afterEach(async ({ page }) => {
  expect(seen.get(page)!.errors).toEqual([])
  expect(seen.get(page)!.outside).toEqual([])
})

async function open(page: Page) {
  await page.goto('/ai')
  await expect(input(page)).toBeEnabled()
  await expect(editor(page)).toContainText('十二月讀書會')
}

/** Sends what is typed and waits until the turn is over. */
async function say(page: Page, words: string) {
  const before = await replies(page).count()
  await input(page).fill(words)
  await input(page).press('Enter')
  await expect.poll(() => replies(page).count()).toBeGreaterThan(before)
  await expect(send(page)).toBeVisible()
}

/** Selects the last few characters of a block, as a reader would with the keyboard. */
async function selectIn(page: Page, words: string) {
  await block(page, words).click()
  await toLineEnd(page)
  for (let count = 0; count < 4; count++)
    await page.keyboard.press('Shift+ArrowLeft')
  await expect(chat(page).locator('.hlx-chat-selection')).toBeVisible()
}

test('the page is in the navigation, with the full editor and the chat beside it', async ({ page }) => {
  await page.goto('/editor')
  const link = page.locator('.site-nav').getByRole('link', { name: 'AI 協作', exact: true })
  await link.click()
  await expect(page).toHaveURL(/\/ai$/)
  await expect(link).toHaveAttribute('aria-current', 'page')
  await expect(page).toHaveTitle(/AI 協作/)
  await expect(page.getByRole('heading', { name: 'AI 協作', level: 1 })).toBeVisible()
  await expect(page.locator('.ai-note')).toContainText('照劇本')

  // The editor as on /editor: its toolbar, and the document already there.
  await expect(page.locator('.ai-frame .hlx-fixed-toolbar')).toBeVisible()
  await expect(editor(page)).toContainText('十二月讀書會')
  await expect(editor(page).locator('> ul > li')).toHaveCount(4)

  // The chat fills the height of the window, beside the editor.
  await expect(suggestions(page)).toHaveCount(4)
  const sizes = await chat(page).evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const frame = document.querySelector('.ai-frame')!.getBoundingClientRect()
    return {
      top: rect.top,
      height: rect.height,
      left: rect.left,
      window: window.innerHeight,
      frameRight: frame.right,
    }
  })
  expect(sizes.height).toBeGreaterThan(sizes.window - 60)
  expect(sizes.left).toBeGreaterThanOrEqual(sizes.frameRight - 1)

  // Nothing to set up: no key, no model, no service.
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
  await expect(page.locator('.wb')).not.toContainText('金鑰')
})

test('"shorter" proposes two merged revisions: one accepted, one rejected, and undo brings the first back', async ({ page }) => {
  await open(page)
  const original = await editor(page).textContent()
  await suggestions(page).filter({ hasText: '精簡' }).click()
  await expect(send(page)).toBeVisible()
  await expect(replies(page).first().locator('.hlx-chat-thinking-toggle')).toBeVisible()
  await expect(cards(page)).toHaveCount(2)
  expect(await editor(page).textContent()).toBe(original)
  // Old and new words in one place.
  await expect(cards(page).first()).toHaveAttribute('data-mode', 'inline')
  await expect(cards(page).first()).toContainText('首先非常感謝各位')

  await cards(page).first().getByRole('button', { name: '接受這項修改' }).click()
  await expect(cards(page)).toHaveCount(1)
  await expect(editor(page)).toContainText('大家好，我們預計在十二月舉辦今年最後一場讀書會。')
  await cards(page).first().getByRole('button', { name: '拒絕這項修改' }).click()
  await expect(cards(page)).toHaveCount(0)
  await expect(editor(page)).toContainText('經過我們內部多次的討論之後')

  await block(page, '報名方式').click()
  await undo(page)
  await expect(cards(page)).toHaveCount(1)
  await expect(editor(page)).toContainText('首先非常感謝各位')
})

test('"into a table" swaps the agenda list for a table that can be edited', async ({ page }) => {
  await open(page)
  await say(page, '把議程整理成表格')
  await expect(cards(page)).toHaveCount(1)
  await expect(cards(page).first().locator('table')).toBeVisible()
  await expect(editor(page).locator('> ul')).toHaveCount(1)

  await cards(page).first().getByRole('button', { name: '接受這項修改' }).click()
  await expect(cards(page)).toHaveCount(0)
  await expect(editor(page).locator('> ul')).toHaveCount(0)
  const cell = editor(page).locator('table td, table th').filter({ hasText: '分組討論' }).first()
  await cell.click()
  await toLineEnd(page)
  await page.keyboard.type('（兩組）')
  await expect(cell).toContainText('分組討論（兩組）')
  // The table plugin is at work on it.
  await expect(page.locator('.hlx-table-handle').first()).toBeAttached()
})

test('"add a FAQ" adds blocks at the end, and a question only gets an answer', async ({ page }) => {
  await open(page)
  await say(page, '在結尾加上常見問題')
  await expect(cards(page)).not.toHaveCount(0)
  await expect(page.locator('.ai-frame')).toContainText('常見問題')
  await expect(editor(page)).not.toContainText('常見問題')
  const pending = await cards(page).count()

  await say(page, '這篇的重點是什麼？')
  await expect(replies(page).last().locator('li')).not.toHaveCount(0)
  await expect(cards(page)).toHaveCount(pending)
})

test('"to English" changes the selected paragraph, and says why when it cannot', async ({ page }) => {
  await open(page)

  // Nothing selected.
  await say(page, '翻成英文')
  await expect(replies(page).last()).toContainText('選取')
  await expect(cards(page)).toHaveCount(0)

  // A paragraph as it was written.
  await selectIn(page, '活動免費')
  await say(page, '翻成英文')
  await expect(cards(page)).toHaveCount(1)
  await expect(cards(page).first()).toContainText('The event is free')
  await cards(page).first().getByRole('button', { name: '拒絕這項修改' }).click()
  await expect(cards(page)).toHaveCount(0)

  // One the reader has changed: there is no translation ready for it.
  await block(page, '活動免費').click()
  await toLineEnd(page)
  await page.keyboard.type('歡迎帶朋友。')
  await selectIn(page, '歡迎帶朋友')
  await say(page, '翻成英文')
  await expect(replies(page).last()).toContainText('原本的內容')
  await expect(cards(page)).toHaveCount(0)
})

test('anything else gets the answer that this is a demo, and starting over puts everything back', async ({ page }) => {
  await open(page)
  const original = await editor(page).textContent()
  await say(page, '幫我寫一首詩')
  await expect(replies(page).last()).toContainText('示範')
  await expect(replies(page).last()).toContainText('把開頭改得精簡一點')
  await expect(cards(page)).toHaveCount(0)

  await say(page, '把開頭改得精簡一點')
  await expect(cards(page)).toHaveCount(2)
  await cards(page).first().getByRole('button', { name: '接受這項修改' }).click()
  await expect(cards(page)).toHaveCount(1)
  expect(await editor(page).textContent()).not.toBe(original)

  await page.getByRole('button', { name: '重新開始' }).click()
  await expect(input(page)).toBeEnabled()
  await expect(cards(page)).toHaveCount(0)
  await expect(suggestions(page)).toHaveCount(4)
  await expect(chat(page).locator('.hlx-chat-message')).toHaveCount(0)
  await expect.poll(() => editor(page).textContent()).toBe(original)
})

test('the other plugins go on working around what is waiting for review', async ({ page }) => {
  await open(page)
  await say(page, '把開頭改得精簡一點')
  await expect(cards(page)).toHaveCount(2)

  // Typing in a block nothing is proposed for.
  await block(page, '活動免費').click()
  await toLineEnd(page)
  await page.keyboard.type('歡迎帶朋友。')
  await expect(editor(page)).toContainText('歡迎帶朋友。')

  // The slash menu, on a new line.
  await page.keyboard.press('Enter')
  await page.keyboard.type('/')
  await expect(page.locator('.hlx-slash-menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')

  // The floating toolbar, on a selection.
  await selectIn(page, '歡迎帶朋友')
  await expect(page.locator('.hlx-floating-toolbar')).toBeVisible()
  await page.keyboard.press('ArrowRight')

  // The block handle, beside a block the pointer is on.
  await block(page, '報名方式').hover()
  await expect(page.locator('.hlx-block-grip').first()).toBeVisible()
  await expect(cards(page)).toHaveCount(2)
})

test('in a narrow window the chat goes under the editor, and in the dark theme both are dark', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 })
  await open(page)
  await say(page, '把開頭改得精簡一點')
  const sizes = await chat(page).evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const frame = document.querySelector('.ai-frame')!.getBoundingClientRect()
    const box = element.querySelector('.hlx-chat-box')!.getBoundingClientRect()
    return {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
      frameBottom: frame.bottom,
      inputBottom: box.bottom,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
  expect(sizes.top).toBeGreaterThanOrEqual(sizes.frameBottom - 1)
  expect(sizes.height).toBeGreaterThan(300)
  expect(sizes.height).toBeLessThan(700)
  expect(sizes.bottom - sizes.inputBottom).toBeLessThan(24)
  expect(sizes.overflowX).toBeLessThanOrEqual(1)

  await setTheme(page, '深色')
  await expect(chat(page)).toHaveAttribute('data-color-scheme', 'dark')
  await expect(page.locator('.ai-frame .hlx-editor')).toHaveAttribute('data-color-scheme', 'dark')
  await expect(cards(page)).toHaveCount(2)
})

test('the three AI package pages point here', async ({ page }) => {
  for (const path of ['/plugins/agent', '/packages/agent-chat', '/packages/agent-core']) {
    await page.goto(path)
    const more = page.locator('.pkg-more a')
    await expect(more).toHaveAttribute('href', '/ai')
    await expect(more).toBeVisible()
    // Leaves a page only once its code is highlighted: WebKit reports an import cut off by leaving.
    await expect(page.locator('.hlx-code-body')).not.toHaveCount(0)
    await expect(page.locator('.hlx-code-body:not([data-highlighted])')).toHaveCount(0)
  }
  await page.locator('.pkg-more a').click()
  await expect(page).toHaveURL(/\/ai$/)
  await expect(input(page)).toBeEnabled()
})
