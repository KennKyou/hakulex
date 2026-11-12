import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { toLineEnd } from './keys'
import { setTheme } from './theme'

/*
 * The chat panel on its demo page, beside an editor with the review plugin. The model answers
 * from a script, so nothing here leaves the page. These run in all three browsers: scrolling,
 * input methods and layout are where they differ.
 */

const demo = (page: Page) => page.locator('.pkg-demo')
const editor = (page: Page) => demo(page).locator('.hlx-content').first()
const cards = (page: Page) => demo(page).locator('.hlx-agent-card')
const chat = (page: Page) => demo(page).locator('.hlx-chat')
const list = (page: Page) => chat(page).locator('.hlx-chat-list')
const messages = (page: Page) => chat(page).locator('.hlx-chat-message')
const replies = (page: Page) => chat(page).locator('.hlx-chat-message[data-role="assistant"]')
const input = (page: Page) => chat(page).getByRole('textbox', { name: '給 AI 的訊息' })
const send = (page: Page) => chat(page).getByRole('button', { name: '送出' })
const stop = (page: Page) => chat(page).getByRole('button', { name: '中止' })
const suggestions = (page: Page) => chat(page).locator('.hlx-chat-suggestion')

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
  await page.goto('/packages/agent-chat')
  await expect(input(page)).toBeEnabled()
})

test.afterEach(async ({ page }) => {
  expect(seen.get(page)!.errors).toEqual([])
  expect(seen.get(page)!.outside).toEqual([])
})

/** Sends what is typed and waits until the reply is whole. */
async function say(page: Page, words: string) {
  const before = await replies(page).count()
  await input(page).fill(words)
  await input(page).press('Enter')
  await expect(replies(page)).toHaveCount(before + 1)
  await expect(send(page)).toBeVisible()
}

test('a suggestion gets a reply that comes in pieces, and edits to review in the editor', async ({ page }) => {
  await expect(suggestions(page)).not.toHaveCount(0)
  const original = await editor(page).textContent()

  await suggestions(page).first().click()
  await expect(messages(page).first()).toHaveAttribute('data-role', 'user')
  await expect(stop(page)).toBeVisible()
  await expect(suggestions(page)).toHaveCount(0)

  // The reply grows while it is coming.
  const reply = replies(page).first().locator('.hlx-chat-text')
  await expect(reply).toBeVisible()
  const early = (await reply.textContent())!.length
  await expect.poll(async () => (await reply.textContent())!.length).toBeGreaterThan(early)

  await expect(send(page)).toBeVisible()
  await expect(replies(page).first().locator('.hlx-chat-step[data-state="done"]')).not.toHaveCount(0)
  // What it did is said in plain words, not in the tools' own terms.
  await expect(chat(page)).not.toContainText('blockId')
  await expect(chat(page)).not.toContainText('<p>')

  // The edits are in the editor to review, and the document is as it was until one is accepted.
  await expect(cards(page)).not.toHaveCount(0)
  expect(await editor(page).textContent()).toBe(original)
  const pending = await cards(page).count()
  await cards(page).first().getByRole('button', { name: '接受這項修改' }).click()
  await expect(cards(page)).toHaveCount(pending - 1)
  expect(await editor(page).textContent()).not.toBe(original)
})

test('anything else typed gets the answer that this is a demo', async ({ page }) => {
  await say(page, '幫我寫一首詩')
  await expect(messages(page).first()).toContainText('幫我寫一首詩')
  await expect(replies(page).first()).toContainText('示範')
  await expect(input(page)).toHaveValue('')
  await expect(cards(page)).toHaveCount(0)
})

test('a reply can be stopped, and the input is ready again', async ({ page }) => {
  await suggestions(page).first().click()
  await expect(stop(page)).toBeVisible()
  await expect(replies(page).first().locator('.hlx-chat-text')).toBeVisible()
  await stop(page).click()

  await expect(replies(page).first()).toContainText('已中止')
  await expect(send(page)).toBeVisible()
  await expect(stop(page)).toHaveCount(0)
  await say(page, '再來一次')
  await expect(replies(page)).toHaveCount(2)
})

test('what is selected in the editor goes along, and stays picked when the input is focused', async ({ page }) => {
  const chip = chat(page).locator('.hlx-chat-selection')
  await expect(chip).toHaveCount(0)

  await editor(page).locator('p').first().click()
  await toLineEnd(page)
  for (let count = 0; count < 4; count++)
    await page.keyboard.press('Shift+ArrowLeft')
  await expect(chip).toBeVisible()
  const picked = (await chip.textContent())!.trim()
  expect(picked.length).toBeGreaterThanOrEqual(3)

  await input(page).click()
  await expect(chip).toBeVisible()
  await expect(chip).toContainText(picked)

  await input(page).fill('改這裡')
  await input(page).press('Enter')
  await expect(chip).toHaveCount(0)
  await expect(send(page)).toBeVisible()

  // Picked again, then taken off.
  await editor(page).locator('p').first().click()
  await toLineEnd(page)
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')
  await expect(chip).toBeVisible()
  await chat(page).getByRole('button', { name: '移除選取' }).click()
  await expect(chip).toHaveCount(0)
})

test('Enter sends, Shift+Enter breaks the line, and an input method\'s Enter is left alone', async ({ page }) => {
  await input(page).click()
  await page.keyboard.type('第一行')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('第二行')
  await expect(input(page)).toHaveValue('第一行\n第二行')
  await expect(messages(page)).toHaveCount(0)

  // As an input method does it: the Enter that picks a word arrives while composing.
  await input(page).evaluate((element) => {
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    element.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      isComposing: true,
      bubbles: true,
      cancelable: true,
    }))
  })
  await expect(messages(page)).toHaveCount(0)
  await input(page).evaluate(element => element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '字' })))

  await page.keyboard.press('Enter')
  await expect(messages(page).first()).toContainText('第一行')
  await expect(messages(page).first()).toContainText('第二行')
  await expect(input(page)).toHaveValue('')
  await expect(send(page)).toBeVisible()

  // With the keyboard alone: from the input, Tab reaches the button once there is something to send.
  await input(page).fill('用鍵盤送出')
  await expect(send(page)).toBeEnabled()
})

test('the panel keeps to its box: only the list scrolls, and a reader who scrolled up is left there', async ({ page }) => {
  const box = async () => chat(page).evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const listElement = element.querySelector('.hlx-chat-list')!
    const boxElement = element.querySelector('.hlx-chat-box')!.getBoundingClientRect()
    return {
      width: rect.width,
      height: rect.height,
      bottom: rect.bottom,
      overflowX: element.scrollWidth - element.clientWidth,
      listOverflowX: listElement.scrollWidth - listElement.clientWidth,
      listScrollable: listElement.scrollHeight - listElement.clientHeight,
      listTop: listElement.scrollTop,
      inputBottom: boxElement.bottom,
    }
  })
  const empty = await box()
  expect(empty.width).toBeGreaterThanOrEqual(280)
  expect(empty.width).toBeLessThanOrEqual(360)

  for (const words of [
    '第一個問題',
    '第二個問題',
    '第三個問題',
    '第四個問題',
    '第五個問題',
    '第六個問題',
  ])
    await say(page, words)

  const full = await box()
  // The same box as when it was empty, with the input still at its foot.
  expect(Math.abs(full.height - empty.height)).toBeLessThanOrEqual(1)
  expect(Math.abs(full.width - empty.width)).toBeLessThanOrEqual(1)
  expect(full.bottom - full.inputBottom).toBeLessThan(24)
  expect(full.overflowX).toBeLessThanOrEqual(1)
  expect(full.listOverflowX).toBeLessThanOrEqual(1)
  expect(full.listScrollable).toBeGreaterThan(40)
  // It followed the newest words to the bottom.
  expect(full.listScrollable - full.listTop).toBeLessThan(4)

  // The reader goes up; a new reply does not pull them back, and the way down is offered.
  // Their own message brings them down, as sending does; they go up while the reply is coming.
  await input(page).fill('把這篇改得精簡一點')
  await input(page).press('Enter')
  await expect(stop(page)).toBeVisible()
  await list(page).evaluate((element) => {
    element.scrollTop = 0
    element.dispatchEvent(new Event('scroll'))
  })
  const jump = chat(page).getByRole('button', { name: '跳到最新' })
  await expect(jump).toBeVisible()
  await expect(send(page)).toBeVisible()
  await expect(cards(page)).not.toHaveCount(0)
  expect((await box()).listTop).toBeLessThan(4)
  await expect(jump).toBeVisible()

  await jump.click()
  await expect(jump).toHaveCount(0)
  const after = await box()
  expect(after.listScrollable - after.listTop).toBeLessThan(4)
})

test('in the dark theme the panel is dark too', async ({ page }) => {
  await setTheme(page, '深色')
  await expect(chat(page)).toHaveAttribute('data-color-scheme', 'dark')
  await expect(demo(page).locator('.hlx-editor')).toHaveAttribute('data-color-scheme', 'dark')
  await say(page, '看一下深色')

  const light = (color: string) => (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).reduce((sum, part) => sum + part, 0) / 3
  const colors = await replies(page).first().evaluate(element => ({
    text: getComputedStyle(element).color,
    mine: getComputedStyle(element.parentElement!.querySelector('[data-role="user"]')!).color,
  }))
  expect(light(colors.text)).toBeGreaterThan(150)
  expect(light(colors.mine)).toBeGreaterThan(150)
})
