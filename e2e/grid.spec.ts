import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { toLineEnd } from './keys'

const editor = (page: Page) => page.locator('.hlx-content').first()
const undo = (page: Page) => page.keyboard.press('ControlOrMeta+Z')
const block = (page: Page) => editor(page).locator('.hlx-grid-editor')
const first = (page: Page) => block(page).first()
const cell = (page: Page, index: number) => first(page).locator('.hlx-grid-cell .hlx-content').nth(index)
const line = (page: Page, text: string) => editor(page).locator('> p', { hasText: text })
const action = (page: Page, name: string) => first(page).getByRole('button', { name, exact: true })

interface Json { type: string, text?: string, cols?: number, cells?: { root: Json }[], children?: Json[] }

async function stored(page: Page): Promise<Json[]> {
  const text = await page.locator('details.json pre').textContent()
  return (JSON.parse(text!) as { root: { children: Json[] } }).root.children
}
const grids = async (page: Page) => (await stored(page)).filter(node => node.type === 'grid-container')
const textOf = (node: Json | undefined): string => node?.text ?? (node?.children ?? []).map(textOf).join('')
const storedCells = async (page: Page) => (await grids(page))[0].cells?.map(item => textOf(item.root))

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

async function sample(page: Page) {
  // 測試用文件 start closed.
  await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
    element.open = true
  })
  await page.getByRole('button', { name: '載入巢狀文件和格狀版面' }).click()
  await expect(block(page)).toHaveCount(2)
}

test.describe('inserting', () => {
  test('from the slash menu, two cells with focus on the first', async ({ page }) => {
    await editor(page).click()
    await page.keyboard.type('/layout')
    await expect(page.locator('.hlx-slash-title').first()).toHaveText('格狀版面')
    await page.keyboard.press('Enter')
    await expect(first(page).locator('.hlx-grid-cell')).toHaveCount(2)
    await expect(cell(page, 0)).toBeFocused()
    await page.keyboard.type('字')
    await expect.poll(() => storedCells(page)).toEqual(['字', ''])
  })

  test('from the toolbar', async ({ page }) => {
    await editor(page).click()
    await page.getByRole('button', { name: '插入' }).click()
    await page.getByRole('menuitem', { name: '格狀版面' }).click()
    await expect(cell(page, 0)).toBeFocused()
  })
})

test.describe('editing', () => {
  test.beforeEach(({ page }) => sample(page))

  test('typing stays where the caret is, between cells and outside', async ({ page }) => {
    await cell(page, 0).click()
    await toLineEnd(page)
    await page.keyboard.type('甲')
    await cell(page, 3).click()
    await toLineEnd(page)
    await page.keyboard.type('乙')
    await line(page, '容器之後').click()
    await toLineEnd(page)
    await page.keyboard.type('外')
    await cell(page, 1).click()
    await toLineEnd(page)
    await page.keyboard.type('丙')
    await expect.poll(() => storedCells(page)).toEqual(['第一格甲', '第二格丙', '第三格', '第四格乙'])
    await expect(line(page, '容器之後外')).toBeVisible()
  })

  test('goes through history in order across cells, with focus following', async ({ page }) => {
    await cell(page, 0).click()
    await toLineEnd(page)
    await page.keyboard.type('甲')
    await cell(page, 1).click()
    await toLineEnd(page)
    await page.keyboard.type('乙')
    await undo(page)
    await expect(cell(page, 1)).toHaveText('第二格')
    await undo(page)
    await expect(cell(page, 0)).toHaveText('第一格')
    await expect(cell(page, 0)).toBeFocused()
  })

  test('columns change the layout, and content stays', async ({ page }) => {
    const columns = () => first(page).locator('.hlx-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)
    expect(await columns()).toBe(2)
    await first(page).hover()
    await action(page, '3 欄').click()
    await expect.poll(columns).toBe(3)
    await action(page, '1 欄').click()
    await expect.poll(columns).toBe(1)
    await expect.poll(() => storedCells(page)).toEqual(['第一格', '第二格', '第三格', '第四格'])
  })

  test('adds a row with focus in it, and only removes a blank last row', async ({ page }) => {
    await first(page).hover()
    await expect(action(page, '移除最後一列')).toBeDisabled()
    await action(page, '新增列').click()
    await expect(first(page).locator('.hlx-grid-cell')).toHaveCount(6)
    await expect(cell(page, 4)).toBeFocused()
    await expect(action(page, '移除最後一列')).toBeEnabled()
    await page.keyboard.type('字')
    await expect(action(page, '移除最後一列')).toBeDisabled()
    await undo(page)
    await expect(action(page, '移除最後一列')).toBeEnabled()
    await action(page, '移除最後一列').click()
    await expect(first(page).locator('.hlx-grid-cell')).toHaveCount(4)
  })

  test('the arrow keys move by column, and leave at the ends', async ({ page }) => {
    await line(page, '格狀版面之前').click()
    await page.keyboard.press('ArrowDown')
    await expect(cell(page, 0)).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(cell(page, 2)).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(editor(page)).toBeFocused()
    await page.keyboard.type('下')
    await expect(line(page, '舊形式之前')).toContainText('下')
  })

  test('Esc selects it, Delete removes it, undo brings it back', async ({ page }) => {
    await cell(page, 1).click()
    await toLineEnd(page)
    await page.keyboard.type('字')
    await page.keyboard.press('Escape')
    await expect(first(page)).toHaveAttribute('data-selected', 'true')
    await page.keyboard.press('Delete')
    await expect(block(page)).toHaveCount(1)
    await undo(page)
    await expect(block(page)).toHaveCount(2)
    await expect(cell(page, 1)).toHaveText('第二格字')
  })

  test('the old form shows, and becomes cells once edited', async ({ page }) => {
    const old = block(page).nth(1).locator('.hlx-grid-cell .hlx-content')
    await expect(old).toHaveText(['舊格一', '舊格二', '舊格三'])
    await old.nth(1).click()
    await toLineEnd(page)
    await page.keyboard.type('字')
    await expect.poll(async () => (await grids(page))[1].cells?.map(item => textOf(item.root))).toEqual(['舊格一', '舊格二字', '舊格三'])
    expect('children' in (await grids(page))[1]).toBe(false)
  })

  test('read only has no controls', async ({ page }) => {
    await page.getByRole('checkbox', { name: '可編輯' }).uncheck()
    await expect(first(page).locator('.hlx-grid-toolbar')).toHaveCount(0)
    await expect(cell(page, 0)).toHaveAttribute('contenteditable', 'false')
  })
})

test.describe('readers', () => {
  test.beforeEach(({ page }) => sample(page))

  test('sees the columns, and one column on a narrow screen', async ({ page }) => {
    await page.getByRole('tab', { name: '預覽' }).click()
    const grid = page.locator('.editor-frame:visible .hlx-grid').first()
    await expect(grid.locator('.hlx-grid-cell')).toHaveCount(4)
    const columns = () => grid.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)
    expect(await columns()).toBe(2)
    await page.setViewportSize({ width: 500, height: 800 })
    await expect.poll(columns).toBe(1)
  })
})
