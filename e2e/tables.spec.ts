import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const editor = (page: Page) => page.locator('.hlx-content')
const rows = (page: Page) => editor(page).locator('tr')
const cell = (page: Page, row: number, column: number) => rows(page).nth(row).locator('th, td').nth(column)

const WIDE_TABLE = [
  `| ${Array.from({ length: 12 }, (_, i) => `Long column heading ${i + 1}`).join(' | ')} |`,
  `| ${Array.from({ length: 12 }).fill('---').join(' | ')} |`,
  `| ${Array.from({ length: 12 }, (_, i) => `value ${i + 1}`).join(' | ')} |`,
].join('\n')

async function focusEditor(page: Page) {
  await editor(page).click()
}

/** Through the real system clipboard and keyboard shortcut. */
async function paste(page: Page, text: string) {
  await page.evaluate(value => navigator.clipboard.writeText(value), text)
  await page.keyboard.press('ControlOrMeta+V')
}

/** One key at a time: slash menu queries depend on real typing. */
async function insertTable(page: Page) {
  await focusEditor(page)
  await page.keyboard.type('/table', { delay: 10 })
  await expect(page.locator('.hlx-slash-menu')).toContainText('表格')
  await page.keyboard.press('Enter')
  await expect(rows(page)).toHaveCount(3)
}

async function pasteTable(page: Page, markdown = '| a | b |\n| --- | --- |\n| c | d |') {
  await focusEditor(page)
  await paste(page, markdown)
  await expect(editor(page).locator('table')).toHaveCount(1)
}

const undo = (page: Page) => page.keyboard.press('ControlOrMeta+Z')

const errors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  page.on('console', (message) => {
    // A link makes the editor look for the site's icon, which needn't exist.
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource'))
      seen.push(message.text())
  })
  await page.route(url => url.hostname !== 'localhost', route => route.abort())
  await page.goto('/editor')
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

test('inserts a table from the slash menu, with the caret in the first cell', async ({ page }) => {
  await insertTable(page)
  await expect(editor(page).locator('th')).toHaveCount(3)
  await expect(editor(page)).not.toContainText('/table')

  await page.keyboard.type('first')
  await expect(cell(page, 0, 0)).toHaveText('first')

  await undo(page)
  await undo(page)
  await expect(editor(page).locator('table')).toHaveCount(0)
})

test('moves between cells with Tab and Shift+Tab', async ({ page }) => {
  await insertTable(page)
  await page.keyboard.type('one')
  await page.keyboard.press('Tab')
  await page.keyboard.type('two')
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.type('!')

  await expect(cell(page, 0, 0)).toHaveText('one!')
  await expect(cell(page, 0, 1)).toHaveText('two')
})

test('keeps focus and structure on Tab in the last cell', async ({ page }) => {
  await pasteTable(page)
  await cell(page, 1, 1).click()
  await page.keyboard.press('Tab')
  await expect(rows(page)).toHaveCount(2)
  await expect(editor(page)).toBeFocused()
})

test('Enter stays in the cell and Backspace does not merge cells', async ({ page }) => {
  await pasteTable(page)
  await cell(page, 0, 1).click()
  await page.keyboard.press('Home')
  await page.keyboard.press('Backspace')
  await expect(rows(page).first().locator('th, td')).toHaveCount(2)

  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('more')
  await expect(cell(page, 0, 1).locator('p')).toHaveCount(2)
  await expect(cell(page, 0, 1)).toContainText('more')
})

test('runs a row action from its handle, undoes it, and returns focus to the table', async ({ page }) => {
  await pasteTable(page)
  await cell(page, 1, 0).click()
  await page.getByRole('button', { name: '列操作' }).click()
  await page.getByRole('menuitem', { name: '在下方插入列' }).click()
  await expect(rows(page)).toHaveCount(3)

  // Typing has to land in the table, not at the start of the document.
  await expect(editor(page)).toBeFocused()
  await page.keyboard.type('X')
  await expect(editor(page).locator('table')).toContainText('X')
  await expect(rows(page).first()).not.toContainText('X')

  await undo(page)
  await undo(page)
  await expect(rows(page)).toHaveCount(2)
})

test('runs a column action from its handle', async ({ page }) => {
  await pasteTable(page)
  await cell(page, 0, 0).click()
  await page.getByRole('button', { name: '欄操作' }).click()
  await page.getByRole('menuitem', { name: '在右側插入欄' }).click()
  await expect(rows(page).first().locator('th, td')).toHaveCount(3)
  await expect(cell(page, 0, 2)).toHaveText('b')
})

test('operates the menu by keyboard, and Esc returns to the same cell', async ({ page }) => {
  await pasteTable(page)
  await cell(page, 1, 1).click()
  await page.getByRole('button', { name: '列操作' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(editor(page)).toBeFocused()
  await page.keyboard.type('Y')
  await expect(cell(page, 1, 1)).toContainText('Y')

  await page.getByRole('button', { name: '列操作' }).focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(rows(page)).toHaveCount(3)
  await expect(editor(page)).toBeFocused()
})

test('appends rows and columns from the append buttons', async ({ page }) => {
  await pasteTable(page)
  await cell(page, 0, 0).click()
  await page.getByRole('button', { name: '新增列' }).click()
  await expect(rows(page)).toHaveCount(3)
  await page.getByRole('button', { name: '新增欄' }).click()
  await expect(rows(page).first().locator('th, td')).toHaveCount(3)
  await expect(editor(page)).toBeFocused()
})

test('toggles the header row', async ({ page }) => {
  await pasteTable(page)
  await cell(page, 0, 0).click()
  await page.getByRole('button', { name: '列操作' }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: '標題列' })).toBeChecked()
  await page.getByRole('menuitemcheckbox', { name: '標題列' }).click()
  await expect(editor(page).locator('th')).toHaveCount(0)
})

test('removes the table with its last row, and still takes typing', async ({ page }) => {
  await pasteTable(page, '| only |\n| --- |')
  await cell(page, 0, 0).click()
  await page.getByRole('button', { name: '列操作' }).click()
  await page.getByRole('menuitem', { name: '刪除列' }).click()
  await expect(editor(page).locator('table')).toHaveCount(0)
  await expect(editor(page)).toBeFocused()
  await page.keyboard.type('still here')
  await expect(editor(page)).toContainText('still here')

  await undo(page)
  await undo(page)
  await expect(editor(page).locator('table')).toHaveCount(1)
})

test('shows handles on hover, and none while read-only', async ({ page }) => {
  await pasteTable(page)
  await cell(page, 1, 1).hover()
  const handle = page.getByRole('button', { name: '列操作' })
  await expect(handle).toBeVisible()

  await page.getByRole('checkbox', { name: '可編輯' }).uncheck()
  await expect(handle).toHaveCount(0)
  await cell(page, 1, 1).click()
  await expect(handle).toHaveCount(0)
  await expect(editor(page)).toHaveAttribute('contenteditable', 'false')
})

test('pastes a markdown table in one undo step, without leftover pipes', async ({ page }) => {
  await focusEditor(page)
  await page.keyboard.type('before')
  await paste(page, '\n\n| **a** | b |\n| --- | --- |\n| [c](https://example.com/) | d |')
  await expect(editor(page).locator('table')).toHaveCount(1)
  await expect(editor(page).locator('th strong, th .hlx-bold')).toHaveCount(1)
  await expect(editor(page).locator('td a')).toHaveAttribute('href', 'https://example.com/')
  await expect(editor(page)).not.toContainText('|')

  await undo(page)
  await expect(editor(page).locator('table')).toHaveCount(0)
  await expect(editor(page)).toContainText('before')
})

test('adds a paragraph when clicking below a trailing table', async ({ page }) => {
  await pasteTable(page)
  await expect(editor(page).locator(':scope > :last-child')).toHaveClass(/hlx-table-wrap/)
  const box = (await editor(page).boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 6)
  await page.keyboard.type('below')
  await expect(editor(page).locator(':scope > p').last()).toHaveText('below')
  await expect(editor(page).locator('table')).not.toContainText('below')
})

test('scrolls a wide table inside its wrapper, and handles follow', async ({ page }) => {
  await pasteTable(page, WIDE_TABLE)
  const wrap = editor(page).locator('.hlx-table-wrap')
  const overflow = () => wrap.evaluate(el => el.scrollWidth > el.clientWidth)
  expect(await overflow()).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

  await cell(page, 1, 2).click()
  const handle = page.getByRole('button', { name: '欄操作' })
  await expect(handle).toBeVisible()
  const centers = async () => {
    const cellBox = (await cell(page, 1, 2).boundingBox())!
    const handleBox = (await handle.boundingBox())!
    return [cellBox.x + cellBox.width / 2, handleBox.x + handleBox.width / 2]
  }
  const [cellBefore, handleBefore] = await centers()
  expect(Math.abs(cellBefore - handleBefore)).toBeLessThan(2)

  await wrap.evaluate((el) => {
    el.scrollLeft = 60
  })
  await expect.poll(async () => {
    const [cellAfter, handleAfter] = await centers()
    return cellAfter !== cellBefore && Math.abs(cellAfter - handleAfter) < 2
  }).toBe(true)

  // Scrolled out of the wrapper, the column has nowhere to show its handle.
  await wrap.evaluate((el) => {
    el.scrollLeft = el.scrollWidth
  })
  await expect(handle).toHaveCount(0)
  await expect(page.getByRole('button', { name: '列操作' })).toBeVisible()
})

test('hides the handles on another tab, and shows them again in the table', async ({ page }) => {
  await pasteTable(page)
  await cell(page, 1, 0).click()
  const handle = page.getByRole('button', { name: '列操作' })
  await expect(handle).toBeVisible()

  await page.getByRole('tab', { name: '預覽' }).click()
  await expect(handle).toHaveCount(0)

  await page.getByRole('tab', { name: '編輯' }).click()
  await cell(page, 1, 0).click()
  await expect(handle).toBeVisible()
})

test('shows the same table in the preview and SSR tabs', async ({ page }) => {
  await pasteTable(page)
  await page.getByRole('tab', { name: '預覽' }).click()
  const renderer = page.locator('.hlx-renderer')
  await expect(renderer.locator('.hlx-table-wrap table th')).toHaveCount(2)
  await expect(renderer.locator('td').first()).toHaveText('c')

  await page.getByRole('tab', { name: 'SSR HTML' }).click()
  const html = page.locator('pre.code-block').first()
  await expect(html).toContainText('<table class="hlx-table">')
  await expect(html).toContainText('<tbody>')
})
