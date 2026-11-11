import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const editor = (page: Page) => page.locator('.hlx-content').first()
const bar = (page: Page) => page.locator('.hlx-fixed-toolbar')
const button = (page: Page, name: string) => bar(page).getByRole('button', { name, exact: true })
const option = (page: Page, name: string) => page.locator('.hlx-fixed-toolbar-menu').getByRole('menuitem', { name, exact: true }).or(page.locator('.hlx-fixed-toolbar-menu').getByRole('menuitemradio', { name, exact: true }))

const errors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  await page.route(url => url.protocol.startsWith('http') && url.hostname !== 'localhost', route => route.abort())
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  page.on('console', (message) => {
    // The picture in one test isn't there, and only WebKit logs that.
    if (message.type() === 'error' && !/404|Failed to load resource/.test(message.text()))
      seen.push(message.text())
  })
  await page.goto('/editor')
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

const selectAll = (page: Page) => page.keyboard.press('ControlOrMeta+A')

test('comes before the content in Tab order, and stays on screen', async ({ page }) => {
  await expect(bar(page)).toBeVisible()
  const order = await page.evaluate(() => {
    const toolbar = document.querySelector('.hlx-fixed-toolbar')!
    const content = document.querySelector('.hlx-content')!
    return toolbar.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING
  })
  expect(order).toBeTruthy()

  await editor(page).click()
  for (let i = 0; i < 60; i++)
    await page.keyboard.press('Enter')
  await page.evaluate(() => window.scrollTo(0, 800))
  // Under the page's bar, which is 44px tall.
  await expect.poll(async () => (await bar(page).boundingBox())!.y).toBeLessThan(60)
  await expect(bar(page)).toBeInViewport()
})

test('formats a selection, which stays selected, and shows what the caret is in', async ({ page }) => {
  await editor(page).click()
  await page.keyboard.type('文字')
  await selectAll(page)
  await button(page, '粗體').click()
  await expect(editor(page).locator('strong')).toHaveText('文字')
  await expect(button(page, '粗體')).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => getSelection()!.toString())).toBe('文字')

  await button(page, '上標').click()
  await button(page, '下標').click()
  await expect(button(page, '上標')).toHaveAttribute('aria-pressed', 'false')
  await expect(button(page, '下標')).toHaveAttribute('aria-pressed', 'true')
})

test('changes the block type with focus returning, in one undo step', async ({ page }) => {
  await editor(page).click()
  await page.keyboard.type('一')
  await page.keyboard.press('Enter')
  await page.keyboard.type('二')
  await selectAll(page)
  await button(page, '區塊類型').click()
  await option(page, '標題 2').click()
  await expect(editor(page).locator('h2')).toHaveCount(2)
  await expect(button(page, '區塊類型')).toContainText('標題 2')
  await expect(editor(page)).toBeFocused()

  await button(page, '復原').click()
  await expect(editor(page).locator('h2')).toHaveCount(0)
  await button(page, '重做').click()
  await expect(editor(page).locator('h2')).toHaveCount(2)
})

test('is never covered by the floating toolbar', async ({ page }) => {
  await editor(page).click()
  await page.keyboard.type('一行字')
  await selectAll(page)
  const floating = page.locator('.hlx-floating-toolbar')
  await expect(floating).toBeVisible()
  await expect.poll(async () => {
    const top = (await bar(page).boundingBox())!
    const box = (await floating.boundingBox())!
    return box.y >= top.y + top.height
  }).toBe(true)
  await button(page, '刪除線').click({ timeout: 3000 })
  await expect(editor(page).locator('.hlx-strikethrough')).toHaveText('一行字')
})

test('undoes and redoes, disabled when there is nothing to do', async ({ page }) => {
  await expect(button(page, '復原')).toBeDisabled()
  await expect(button(page, '重做')).toBeDisabled()
  await editor(page).click()
  await page.keyboard.type('字')
  await expect(button(page, '復原')).toBeEnabled()
  await button(page, '復原').click()
  await expect(editor(page).locator('p')).toHaveText('')
  await expect(button(page, '重做')).toBeEnabled()
  await button(page, '重做').click()
  await expect(editor(page).locator('p')).toHaveText('字')
})

test('adds a link through the input, refusing unsafe ones', async ({ page }) => {
  await editor(page).click()
  await page.keyboard.type('連結')
  await expect(button(page, '連結')).toBeDisabled()
  await selectAll(page)
  await button(page, '連結').click()
  const input = bar(page).getByLabel('網址', { exact: true })
  await expect(input).toBeFocused()

  await page.keyboard.type('javascript:alert(1)')
  await page.keyboard.press('Enter')
  await expect(bar(page).getByRole('alert')).toBeVisible()

  await input.fill('example.com')
  await page.keyboard.press('Enter')
  await expect(editor(page).locator('a')).toHaveAttribute('href', 'https://example.com')
  await expect(editor(page)).toBeFocused()
})

test('cancels a link with Escape, leaving the document and focus right', async ({ page }) => {
  await editor(page).click()
  await page.keyboard.type('連結')
  await selectAll(page)
  await button(page, '連結').click()
  await page.keyboard.type('example.com')
  await page.keyboard.press('Escape')
  await expect(editor(page).locator('a')).toHaveCount(0)
  await expect(editor(page)).toBeFocused()
})

test('inserts at the caret, or at the end before anyone has clicked', async ({ page }) => {
  await button(page, '插入').click()
  await option(page, '分隔線').click()
  await expect(editor(page).locator('hr')).toHaveCount(1)
  await page.keyboard.type('後面')
  await expect(editor(page).locator('p').last()).toHaveText('後面')
})

test('opens a dialog from the insert menu, keeping its focus', async ({ page }) => {
  await editor(page).click()
  await button(page, '插入').click()
  await option(page, '影片').click()
  const dialog = page.locator('.hlx-media-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('input[name="src"]')).toBeFocused()
  await page.keyboard.type('/a.webm')
  await page.keyboard.press('Enter')
  await expect(editor(page).locator('video')).toHaveCount(1)
})

test('disables text controls for a selected image, and goes away while read-only', async ({ page }) => {
  await editor(page).click()
  await page.evaluate(() => navigator.clipboard.writeText('![cat](https://example.com/a.png)\n\n字'))
  await page.keyboard.press('ControlOrMeta+V')
  await page.locator('.hlx-image-editor').click()
  await expect(button(page, '粗體')).toBeDisabled()
  await expect(button(page, '區塊類型')).toBeDisabled()
  await expect(button(page, '插入')).toBeEnabled()

  await page.getByRole('checkbox', { name: '可編輯' }).uncheck()
  await expect(bar(page)).toHaveCount(0)
})

test.describe('inside other editors', () => {
  const cell = (page: Page, index: number) => page.locator('.hlx-grid-cell .hlx-content').nth(index)
  const tool = (page: Page, name: string) => page.locator('.hlx-fixed-toolbar').getByRole('button', { name, exact: true })

  test.beforeEach(async ({ page }) => {
    // 測試用文件 start closed.
    await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
      element.open = true
    })
    await page.getByRole('button', { name: '載入巢狀文件和格狀版面' }).click()
    await expect(cell(page, 0)).toBeVisible()
  })

  test('formats what is selected in a cell, and keeps the focus there', async ({ page }) => {
    await cell(page, 0).click()
    await page.keyboard.press('ControlOrMeta+A')
    await tool(page, '粗體').click()
    await expect(cell(page, 0).locator('strong')).toHaveText('第一格')
    await expect(cell(page, 1).locator('strong')).toHaveCount(0)
    await expect(cell(page, 0)).toBeFocused()
    await expect(tool(page, '粗體')).toHaveAttribute('aria-pressed', 'true')
    await cell(page, 1).click()
    await expect(tool(page, '粗體')).toHaveAttribute('aria-pressed', 'false')
  })

  test('changes the block type in a cell', async ({ page }) => {
    await cell(page, 1).click()
    await tool(page, '區塊類型').click()
    await page.getByRole('menuitemradio', { name: '標題 2' }).click()
    await expect(cell(page, 1).locator('h2')).toHaveText('第二格')
    await expect(cell(page, 1)).toBeFocused()
    await page.keyboard.type('字')
    await expect(cell(page, 1).locator('h2')).toContainText('字')
  })

  test('makes a link in a nested document', async ({ page }) => {
    const nested = page.locator('.hlx-nested-doc .hlx-content').first()
    await nested.click()
    await page.keyboard.press('ControlOrMeta+A')
    await tool(page, '連結').click()
    await page.getByRole('textbox', { name: '網址' }).fill('https://example.com')
    await page.keyboard.press('Enter')
    await expect(nested.locator('a')).toHaveAttribute('href', 'https://example.com')
    await expect(nested).toBeFocused()
  })

  test('inserts in a cell, offering only what can go there', async ({ page }) => {
    await cell(page, 2).click()
    await tool(page, '插入').click()
    await expect(page.getByRole('menuitem', { name: '格狀版面' })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: '步驟' })).toHaveCount(0)
    await page.getByRole('menuitem', { name: '分隔線' }).click()
    await expect(cell(page, 2).locator('hr, .hlx-hr-block').first()).toBeVisible()
    await editor(page).locator('> p').first().click()
    await tool(page, '插入').click()
    await expect(page.getByRole('menuitem', { name: '格狀版面' })).toBeVisible()
  })

  test('only history works in a step\'s title', async ({ page }) => {
    // 測試用文件 start closed.
    await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
      element.open = true
    })
    await page.getByRole('button', { name: '載入提及、嵌入和步驟' }).click()
    await page.locator('.hlx-step-title-input').first().click()
    await expect(tool(page, '粗體')).toBeDisabled()
    await expect(tool(page, '插入')).toBeDisabled()
    await page.locator('.hlx-step-content .hlx-content').first().click()
    await expect(tool(page, '插入')).toBeEnabled()
  })
})
