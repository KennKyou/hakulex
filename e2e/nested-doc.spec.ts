import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { toLineEnd, toLineStart } from './keys'

const editor = (page: Page) => page.locator('.hlx-content').first()
const undo = (page: Page) => page.keyboard.press('ControlOrMeta+Z')
const redo = (page: Page) => page.keyboard.press('ControlOrMeta+Shift+Z')
const block = (page: Page) => editor(page).locator('.hlx-nested-doc-editor')
const content = (page: Page, index = 0) => block(page).nth(index).locator('.hlx-content')
const line = (page: Page, text: string) => editor(page).locator('> p', { hasText: text })

interface Json { type: string, text?: string, content?: { root: Json }, children?: Json[] }

async function stored(page: Page): Promise<Json[]> {
  const text = await page.locator('details.json pre').textContent()
  return (JSON.parse(text!) as { root: { children: Json[] } }).root.children
}
const textOf = (node: Json | undefined): string => node?.text ?? (node?.children ?? []).map(textOf).join('')
const storedText = async (page: Page, index = 0) => textOf((await stored(page)).filter(node => node.type === 'nested-doc')[index]?.content?.root)

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
  test('from the slash menu, with focus inside, as one undo step', async ({ page }) => {
    await editor(page).click()
    await page.keyboard.type('/nested')
    await page.keyboard.press('Enter')
    await expect(content(page)).toBeFocused()
    await page.keyboard.type('字')
    await expect.poll(() => storedText(page)).toBe('字')
  })

  test('from the toolbar', async ({ page }) => {
    await editor(page).click()
    await page.getByRole('button', { name: '插入' }).click()
    await page.getByRole('menuitem', { name: '巢狀文件' }).click()
    await expect(content(page)).toBeFocused()
  })
})

test.describe('editing', () => {
  test.beforeEach(({ page }) => sample(page))

  test('has markdown shortcuts and its own slash menu, without containers', async ({ page }) => {
    await content(page).click()
    await toLineEnd(page)
    await page.keyboard.press('Enter')
    await page.keyboard.type('# 小標')
    await expect(content(page).locator('h1')).toHaveText('小標')
    await page.keyboard.press('Enter')
    await page.keyboard.type('/')
    await expect(page.locator('.hlx-slash-menu')).toHaveCount(1)
    for (const title of ['步驟', '巢狀文件', '格狀版面', '註腳']) {
      await expect(page.locator('.hlx-slash-title', {
        hasText: new RegExp(`^${title}$`),
      })).toHaveCount(0)
    }
  })

  test('typing stays where the caret is, going back and forth', async ({ page }) => {
    await content(page).click()
    await toLineEnd(page)
    await page.keyboard.type('甲')
    await line(page, '容器之後').click()
    await toLineEnd(page)
    await page.keyboard.type('外')
    await content(page).click()
    await toLineEnd(page)
    await page.keyboard.type('乙')
    await expect(content(page)).toHaveText('巢狀文件的第一段。甲乙')
    await expect(line(page, '容器之後外')).toBeVisible()
    await expect.poll(() => storedText(page)).toBe('巢狀文件的第一段。甲乙')
  })

  test('goes through history in order, with focus following', async ({ page }) => {
    await line(page, '容器之後').click()
    await toLineEnd(page)
    await page.keyboard.type('外')
    await content(page).click()
    await toLineEnd(page)
    await page.keyboard.type('內')
    await undo(page)
    await expect(content(page)).toHaveText('巢狀文件的第一段。')
    await undo(page)
    await expect(line(page, '容器之後外')).toHaveCount(0)
    await expect(editor(page)).toBeFocused()
    await redo(page)
    await expect(line(page, '容器之後外')).toBeVisible()
    await redo(page)
    await expect(content(page)).toHaveText('巢狀文件的第一段。內')
    await expect(content(page)).toBeFocused()
  })

  test('Esc selects it, Delete removes it, undo brings it back, and it still takes edits', async ({ page }) => {
    await content(page).click()
    await toLineEnd(page)
    await page.keyboard.type('字')
    await page.keyboard.press('Escape')
    await expect(block(page).first()).toHaveAttribute('data-selected', 'true')
    await page.keyboard.press('Delete')
    await expect(block(page)).toHaveCount(1)
    await undo(page)
    await expect(block(page)).toHaveCount(2)
    await expect(content(page)).toHaveText('巢狀文件的第一段。字')
    await content(page).click()
    await toLineEnd(page)
    await page.keyboard.type('又')
    await expect.poll(() => storedText(page)).toBe('巢狀文件的第一段。字又')
  })

  test('the arrow keys go in and out', async ({ page }) => {
    await line(page, '容器之前').click()
    await page.keyboard.press('ArrowDown')
    await expect(content(page)).toBeFocused()
    await page.keyboard.type('入')
    await expect(content(page)).toContainText('入')
    await page.keyboard.press('ArrowDown')
    await expect(editor(page)).toBeFocused()
    await page.keyboard.type('出')
    await expect(line(page, '長文件之前')).toContainText('出')
  })

  test('copies from the handle, and the copy can be edited apart', async ({ page }) => {
    await line(page, '容器之前').hover()
    await block(page).first().hover()
    await page.locator('.hlx-block-grip').click()
    await page.locator('.hlx-block-menu').getByRole('menuitem', { name: '複製' }).click()
    await expect(block(page)).toHaveCount(3)
    await content(page, 1).click()
    await toLineEnd(page)
    await page.keyboard.type('複本')
    await expect(content(page, 1)).toHaveText('巢狀文件的第一段。複本')
    await expect(content(page, 0)).toHaveText('巢狀文件的第一段。')
  })
})

test.describe('readers', () => {
  test.beforeEach(({ page }) => sample(page))

  test('a long one is cut short and can be opened, with short ones left alone', async ({ page }) => {
    await page.getByRole('tab', { name: '預覽' }).click()
    const docs = page.locator('.editor-frame:visible .hlx-nested-doc')
    await expect(docs).toHaveCount(2)
    await expect(docs.nth(0).locator('.hlx-nested-doc-toggle')).toHaveCount(0)
    await expect(docs.nth(1)).toHaveAttribute('data-collapsed', '')
    const closed = await docs.nth(1).locator('.hlx-nested-doc-body').evaluate(element => element.clientHeight)
    await docs.nth(1).getByRole('button', { name: '展開全文' }).click()
    await expect(docs.nth(1)).not.toHaveAttribute('data-collapsed', '')
    const open = await docs.nth(1).locator('.hlx-nested-doc-body').evaluate(element => element.clientHeight)
    expect(open).toBeGreaterThan(closed)
    await docs.nth(1).getByRole('button', { name: '收合' }).click()
    await expect(docs.nth(1)).toHaveAttribute('data-collapsed', '')
  })

  test('read only keeps it cut short, and can still open it', async ({ page }) => {
    await page.getByRole('checkbox', { name: '可編輯' }).uncheck()
    const long = block(page).nth(1).locator('.hlx-nested-doc')
    await expect(long).toHaveAttribute('data-collapsed', '')
    await expect(content(page, 1)).toHaveAttribute('contenteditable', 'false')
    await long.getByRole('button', { name: '展開全文' }).click()
    await expect(long).not.toHaveAttribute('data-collapsed', '')
  })

  test('is a card, cut at 300px with its foot fading out', async ({ page }) => {
    await page.getByRole('tab', { name: '預覽' }).click()
    const card = page.locator('.editor-frame:visible .hlx-nested-doc').nth(1)
    const style = (name: string) => card.evaluate((element, property) => getComputedStyle(element).getPropertyValue(property), name)
    expect(await style('border-top-width')).toBe('1px')
    expect(await style('border-top-left-radius')).toBe('8px')
    expect(await style('margin-top')).toBe('16px')
    const body = card.locator('.hlx-nested-doc-body')
    // 300px in all, padding included.
    expect((await body.boundingBox())!.height).toBe(300)
    expect(await body.evaluate(element => getComputedStyle(element).paddingLeft)).toBe('32px')
    const fade = card.locator('.hlx-nested-doc-fade')
    const [bodyBox, fadeBox] = [(await body.boundingBox())!, (await fade.boundingBox())!]
    expect(fadeBox.height).toBe(64)
    expect(fadeBox.y + fadeBox.height).toBeCloseTo(bodyBox.y + bodyBox.height, 0)
    expect(await fade.evaluate(element => getComputedStyle(element).backgroundImage)).toMatch(/^linear-gradient\(/)
  })
})

test.describe('a long one while editing', () => {
  test.beforeEach(({ page }) => sample(page))
  const long = (page: Page) => block(page).nth(1).locator('.hlx-nested-doc')

  test('starts cut short, opens where it is clicked, and stays open once the caret leaves', async ({ page }) => {
    await expect(long(page)).toHaveAttribute('data-collapsed', '')
    // A paragraph that is inside the cut: the caret goes where it is clicked.
    const fifth = content(page, 1).locator('p', { hasText: '第 5 段' })
    const box = (await fifth.boundingBox())!
    await page.mouse.click(box.x + 4, box.y + box.height / 2)
    await expect(long(page)).not.toHaveAttribute('data-collapsed', '')
    await page.keyboard.type('Z')
    await expect(fifth).toHaveText('Z長文件的第 5 段。')
    await line(page, '格狀版面之前').click()
    await page.keyboard.type('!')
    await expect(long(page)).not.toHaveAttribute('data-collapsed', '')
    await long(page).getByRole('button', { name: '收合' }).click()
    await expect(long(page)).toHaveAttribute('data-collapsed', '')
    await expect(fifth).toHaveText('Z長文件的第 5 段。')
  })

  test('opens when entered from the line after, with the caret at the end in view', async ({ page }) => {
    await line(page, '格狀版面之前').click()
    await toLineStart(page)
    await page.keyboard.press('ArrowUp')
    await expect(content(page, 1)).toBeFocused()
    await expect(long(page)).not.toHaveAttribute('data-collapsed', '')
    await page.keyboard.type('尾')
    const last = content(page, 1).locator('p').last()
    await expect(last).toContainText('尾')
    await expect(last).toBeInViewport()
  })
})
