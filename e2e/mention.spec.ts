import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { toLineEnd } from './keys'

const editor = (page: Page) => page.locator('.hlx-content').first()
const undo = (page: Page) => page.keyboard.press('ControlOrMeta+Z')
const mention = (page: Page) => editor(page).locator('.hlx-mention')
const panel = (page: Page) => page.locator('.hlx-mention-panel')
const menu = (page: Page) => page.locator('.hlx-mention-menu')
const items = (page: Page) => page.locator('.hlx-mention-item')

interface Json { type: string, text?: string, platform?: string, handle?: string, displayName?: string, children?: Json[] }

async function stored(page: Page): Promise<Json[]> {
  const text = await page.locator('details.json pre').textContent()
  return (JSON.parse(text!) as { root: { children: Json[] } }).root.children
}
const inline = async (page: Page) => (await stored(page))[0].children ?? []

const errors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  await page.route(url => url.protocol.startsWith('http') && url.hostname !== 'localhost', route => route.abort())
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource'))
      seen.push(message.text())
  })
  // Previews load third-party pages. Tests don't depend on those.
  await page.route(/youtube\.com|bilibili\.com|spotify\.com|apple\.com|codesandbox\.io|gist\.github\.com/, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>stub</title>' }))
  await page.goto('/editor')
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

async function typeMention(page: Page, text = '前 @GH:octocat') {
  await editor(page).click()
  await page.keyboard.type(text)
  await expect(items(page)).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(mention(page)).toHaveCount(1)
}

test.describe('the menu', () => {
  test('lists platforms for @, asks for the account, and makes a mention', async ({ page }) => {
    await editor(page).click()
    await page.keyboard.type('@')
    // Nine platforms, by name from A to Z: Enter takes the first, Bilibili.
    await expect(items(page)).toHaveCount(9)
    await page.keyboard.press('Enter')
    await expect(editor(page)).toHaveText('@BL:')
    await expect(menu(page)).toContainText('輸入帳號')
    await page.keyboard.type('octocat')
    await expect(items(page)).toHaveCount(1)
    await page.keyboard.press('Enter')
    await expect(menu(page)).toHaveCount(0)
    await expect(mention(page).locator('a')).toHaveAttribute('href', 'https://space.bilibili.com/octocat')
    await page.keyboard.type('後')
    await expect(editor(page)).toHaveText('octocat 後')
  })

  test('picks with the mouse, keeping the typing going', async ({ page }) => {
    await editor(page).click()
    await page.keyboard.type('@neo')
    // Third from A to Z: GitHub.
    await items(page).nth(2).click()
    await expect(mention(page).locator('a')).toHaveAttribute('href', 'https://github.com/neo')
    await page.keyboard.type('字')
    await expect(editor(page)).toContainText('字')
  })

  test('takes the full-width @', async ({ page }) => {
    await editor(page).click()
    await page.keyboard.insertText('＠')
    await expect(items(page)).toHaveCount(9)
  })

  test('undo takes back the mention and leaves the text', async ({ page }) => {
    await typeMention(page)
    await undo(page)
    await expect(mention(page)).toHaveCount(0)
    await expect(editor(page)).toHaveText('前 @GH:octocat')
  })

  test('stays away from an email address', async ({ page }) => {
    await editor(page).click()
    await page.keyboard.type('a@b.com')
    await expect(menu(page)).toHaveCount(0)
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await stored(page)).length).toBe(2)
  })

  test('Esc closes it for good, until the @ is gone', async ({ page }) => {
    await editor(page).click()
    await page.keyboard.type('@')
    await expect(menu(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu(page)).toHaveCount(0)
    await page.keyboard.type('abc')
    await expect(menu(page)).toHaveCount(0)
    await expect(editor(page)).toHaveText('@abc')
  })
})

test.describe('as part of the text', () => {
  test('arrow keys go past it and typing lands on the other side', async ({ page }) => {
    await typeMention(page, '@GH:octocat')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.type('前')
    await expect.poll(async () => (await inline(page)).map(node => node.type)).toEqual(['text', 'mention', 'text'])
    expect((await inline(page))[0].text).toBe('前')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.type('後')
    await expect.poll(async () => (await inline(page)).at(-1)?.text).toContain('後')
  })

  test('backspace removes it, and undo brings it back', async ({ page }) => {
    await typeMention(page, '@GH:octocat')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await expect(mention(page)).toHaveCount(0)
    await undo(page)
    await expect(mention(page)).toHaveCount(1)
  })
})

test.describe('the panel', () => {
  test('saves on Enter with the caret after it', async ({ page }) => {
    await typeMention(page, '@GH:octocat')
    await mention(page).click()
    await expect(panel(page)).toBeVisible()
    await panel(page).getByLabel('帳號').fill('neo')
    await panel(page).getByLabel('顯示名稱').fill('尼歐')
    await panel(page).getByLabel('帳號').press('Enter')
    await expect(panel(page)).toHaveCount(0)
    await expect(mention(page).locator('a')).toHaveText('尼歐')
    await expect.poll(async () => (await inline(page))[0].handle).toBe('neo')
    await page.keyboard.type('字')
    await expect.poll(async () => (await inline(page)).at(-1)?.text).toContain('字')
    await page.waitForTimeout(350)
    await page.keyboard.press('ControlOrMeta+Z')
    await page.keyboard.press('ControlOrMeta+Z')
    await expect.poll(async () => (await inline(page))[0].handle).toBe('octocat')
  })

  test('saves when clicking elsewhere, with the caret where it was clicked', async ({ page }) => {
    await typeMention(page, '字 @GH:octocat')
    await page.keyboard.press('Enter')
    await page.keyboard.type('第二行')
    await mention(page).click()
    await panel(page).getByLabel('帳號').fill('neo')
    await editor(page).locator('p').nth(1).click()
    await expect(panel(page)).toHaveCount(0)
    await expect.poll(async () => (await inline(page))[1].handle).toBe('neo')
    await toLineEnd(page)
    await page.keyboard.type('尾')
    await expect(editor(page).locator('p').nth(1)).toHaveText('第二行尾')
  })

  test('Esc throws the change away', async ({ page }) => {
    await typeMention(page, '@GH:octocat')
    await mention(page).click()
    await panel(page).getByLabel('帳號').fill('neo')
    await page.keyboard.press('Escape')
    await expect(panel(page)).toHaveCount(0)
    expect((await inline(page))[0].handle).toBe('octocat')
  })

  test('removes it', async ({ page }) => {
    await typeMention(page, '前 @GH:octocat')
    await mention(page).click()
    await panel(page).getByRole('button', { name: '移除' }).click()
    await expect(mention(page)).toHaveCount(0)
    await page.keyboard.type('字')
    await expect(editor(page)).toContainText('字')
    await undo(page)
    await undo(page)
    await expect(mention(page)).toHaveCount(1)
  })

  test('doesn\'t open when read only, and the link is live', async ({ page }) => {
    await typeMention(page, '@GH:octocat')
    await page.getByRole('checkbox', { name: '可編輯' }).uncheck()
    await page.route('https://github.com/**', route => route.fulfill({ status: 200, body: 'ok' }))
    const opened = page.waitForEvent('popup')
    await mention(page).locator('a').click()
    await opened
    await expect(panel(page)).toHaveCount(0)
  })
})

test.describe('markdown and copying', () => {
  test('turns into a mention on typing the closing brace', async ({ page }) => {
    await editor(page).click()
    await page.keyboard.type('{TG@neo} 字')
    await expect(mention(page).locator('a')).toHaveAttribute('href', 'https://t.me/neo')
    await expect(editor(page)).toContainText('字')
  })

  test('copies with its data', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'only Chromium can grant clipboard permissions')
    await typeMention(page, '@GH:octocat')
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.press('ControlOrMeta+C')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ControlOrMeta+V')
    await expect(mention(page)).toHaveCount(2)
    await expect.poll(async () => (await inline(page)).filter(node => node.type === 'mention').map(node => node.handle)).toEqual(['octocat', 'octocat'])
  })
})

test('shows the same in the preview', async ({ page }) => {
  // 測試用文件 start closed.
  await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
    element.open = true
  })
  await page.getByRole('button', { name: '載入提及、嵌入和步驟' }).click()
  await expect(mention(page)).toHaveCount(1)
  await page.getByRole('tab', { name: '預覽' }).click()
  const preview = page.locator('.editor-frame:visible .hlx-mention')
  await expect(preview).toHaveCount(1)
  await expect(preview.locator('a')).toHaveText('Ken')
})
