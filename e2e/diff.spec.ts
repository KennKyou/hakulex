import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { toLineEnd } from './keys'

/*
 * The demo's 比較 tab: a version kept with 記下目前版本 against the document as it is now, side
 * by side and in one column, with the change counts; and the sample pair.
 */

const editor = (page: Page) => page.locator('.editor-frame:visible .hlx-content').first()
const diff = (page: Page) => page.locator('.hlx-diff')
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click()

const errors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource'))
      seen.push(message.text())
  })
  await page.route(url => url.protocol.startsWith('http') && url.hostname !== 'localhost', route => route.abort())
  await page.goto('/editor')
  await page.getByRole('button', { name: '清空文件' }).click()
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

/** What each row shows on the left and the right, by kind and text. */
function splitRows(page: Page) {
  return diff(page).locator('.hlx-diff-row').evaluateAll(rows => rows.map(row => [...row.children].map(cell => `${cell.getAttribute('data-diff-type')}:${cell.textContent?.trim() ?? ''}`)))
}

test('compares a kept version with the document as it is now', async ({ page }) => {
  await editor(page).click()
  await page.keyboard.type('第一段')
  await page.keyboard.press('Enter')
  await page.keyboard.type('第二段')
  await page.keyboard.press('Enter')
  await page.keyboard.type('第三段')

  await tab(page, '比較')
  await expect(page.getByText('先按「記下目前版本」')).toBeVisible()
  await page.getByRole('button', { name: '記下目前版本' }).click()
  await expect(page.locator('.diff-stats')).toHaveText('沒有變更')

  await tab(page, '編輯')
  await editor(page).getByText('第二段').click()
  await toLineEnd(page)
  await page.keyboard.type('改過')
  await editor(page).getByText('第三段').click()
  await toLineEnd(page)
  await page.keyboard.press('Enter')
  await page.keyboard.type('第四段')

  await tab(page, '比較')
  await expect(diff(page).locator('.hlx-diff-header')).toHaveText(['舊版新版'])
  expect(await splitRows(page)).toEqual([
    ['equal:第一段', 'equal:第一段'],
    ['delete:第二段', 'insert:第二段改過'],
    ['equal:第三段', 'equal:第三段'],
    ['empty:', 'insert:第四段'],
  ])
  await expect(diff(page).locator('[data-diff-type="insert"] span[style]').first()).toHaveText('改過')
  await expect(page.locator('.diff-stats')).toHaveText('+1 個區塊、+5 詞、+6 字元')

  await page.getByRole('radio', { name: '一欄' }).check()
  await expect(diff(page).locator('.hlx-diff-body > *')).toHaveText(['第一段', '第二段改過', '第三段', '第四段'])
  await expect(diff(page).locator('[data-diff-type="modify"]')).toHaveText('第二段改過')
  await expect(diff(page).locator('[data-diff-type="insert"]')).toHaveText('第四段')
})

test('shows the sample pair, and folds unchanged blocks in one column', async ({ page }) => {
  await tab(page, '比較')
  await page.getByRole('button', { name: '載入範例', exact: true }).click()
  const rows = await splitRows(page)
  // The same 23 rows, paired the same way's diff page shows for this sample.
  expect(rows).toHaveLength(23)
  expect(rows.map(row => row.map(cell => cell.split(':')[0]))).toEqual([
    ['delete', 'insert'],
    ['delete', 'insert'],
    ['empty', 'insert'],
    ['equal', 'equal'],
    ['delete', 'insert'],
    ['delete', 'insert'],
    ['delete', 'insert'],
    ['equal', 'equal'],
    ['delete', 'insert'],
    ['delete', 'insert'],
    ['empty', 'insert'],
    ['equal', 'equal'],
    ['delete', 'insert'],
    ['delete', 'insert'],
    ['delete', 'insert'],
    ['delete', 'insert'],
    ['delete', 'insert'],
    ...Array.from({ length: 6 }, () => ['empty', 'insert']),
  ])
  await expect(diff(page).locator('.hlx-diff-row').nth(2).locator('.hlx-alert')).toHaveCount(1)
  await expect(page.locator('.diff-stats')).toHaveText('+8 個區塊、+494/-328 詞、+769/-467 字元')
  // The editor holds the new version.
  await tab(page, '編輯')
  await expect(editor(page).locator('.hlx-alert')).toHaveCount(1)

  await tab(page, '比較')
  await page.getByRole('radio', { name: '一欄' }).check()
  await page.getByRole('checkbox', { name: '收合未變更的區塊' }).check()
  // Unchanged runs here are single blocks between changes, so nothing folds.
  await expect(diff(page).locator('.hlx-diff-collapsed')).toHaveCount(0)
  expect(await diff(page).locator('.hlx-diff-body > *').evaluateAll(parts => parts.map(part => part.getAttribute('data-diff-type')))).toEqual([
    'modify',
    'insert',
    'equal',
    'modify',
    'equal',
    'modify',
    'insert',
    'equal',
    'insert',
    'modify',
    'delete',
    'insert',
    'modify',
    'insert',
    'modify',
    'insert',
  ])
})
