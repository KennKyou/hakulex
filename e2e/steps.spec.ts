import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { toLineEnd } from './keys'

const editor = (page: Page) => page.locator('.hlx-content').first()
const undo = (page: Page) => page.keyboard.press('ControlOrMeta+Z')
const redo = (page: Page) => page.keyboard.press('ControlOrMeta+Shift+Z')
const block = (page: Page) => page.locator('.hlx-steps-editor')
const stepAt = (page: Page, index: number) => page.locator('.hlx-step').nth(index)
const title = (page: Page, index: number) => stepAt(page, index).locator('.hlx-step-title-input')
const content = (page: Page, index: number) => stepAt(page, index).locator('.hlx-step-content .hlx-content')
const action = (page: Page, index: number, name: string) => stepAt(page, index).locator(`[data-action="${name}"]`)
const line = (page: Page, text: string) => editor(page).locator('> p', { hasText: text })

interface Json { type: string, text?: string, title?: string, id?: string, steps?: Json[], content?: { root: Json }, children?: Json[] }

async function stored(page: Page): Promise<Json[]> {
  const text = await page.locator('details.json pre').textContent()
  return (JSON.parse(text!) as { root: { children: Json[] } }).root.children
}
const storedSteps = async (page: Page) => (await stored(page)).find(node => node.type === 'steps')?.steps ?? []
const textOf = (node: Json | undefined): string => node?.text ?? (node?.children ?? []).map(textOf).join('')
const storedTexts = async (page: Page) => (await storedSteps(page)).map(step => textOf(step.content?.root))
const storedTitles = async (page: Page) => (await storedSteps(page)).map(step => step.title)

const errors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/ERR_|Failed to load|blocked/i.test(message.text()))
      seen.push(message.text())
  })
  // Previews load third-party pages. Tests don't depend on those.
  await page.route(/youtube\.com|bilibili\.com|spotify\.com|apple\.com|codesandbox\.io|gist\.github\.com/, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>stub</title>' }))
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
  await page.getByRole('button', { name: '載入提及、嵌入和步驟' }).click()
  await expect(stepAt(page, 2)).toBeVisible()
}

async function clickEnd(target: Locator, page: Page) {
  await target.click()
  await toLineEnd(page)
}

test.describe('inserting', () => {
  test('from the slash menu, with focus on the title, as one undo step', async ({ page }) => {
    await editor(page).click()
    await page.keyboard.type('/steps')
    await expect(page.locator('.hlx-slash-menu [role="option"]')).toHaveCount(1)
    await page.keyboard.press('Enter')
    await expect(title(page, 0)).toBeFocused()
    await page.keyboard.type('安裝')
    await page.keyboard.press('Enter')
    await expect(content(page, 0)).toBeFocused()
    await page.keyboard.type('內容')
    await expect.poll(() => storedTitles(page)).toEqual(['安裝'])
    await expect.poll(() => storedTexts(page)).toEqual(['內容'])
  })

  test('from the toolbar', async ({ page }) => {
    await editor(page).click()
    await page.getByRole('button', { name: '插入' }).click()
    await page.getByRole('menuitem', { name: '步驟' }).click()
    await expect(title(page, 0)).toBeFocused()
  })
})

test.describe('editing the content', () => {
  test.beforeEach(({ page }) => sample(page))

  test('has markdown shortcuts, lists and code blocks', async ({ page }) => {
    await clickEnd(content(page, 0), page)
    await page.keyboard.press('Enter')
    await page.keyboard.type('# 小標')
    await expect(content(page, 0).locator('h1')).toHaveText('小標')
    await page.keyboard.press('Enter')
    await page.keyboard.type('- 項目')
    await expect(content(page, 0).locator('li')).toHaveText('項目')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.type('**粗** ')
    await expect(content(page, 0).locator('strong')).toHaveText('粗')
    await expect.poll(async () => (await storedSteps(page))[0].content?.root.children?.[1].type).toBe('heading')
  })

  test('typing stays where the caret is, between editors and after outer updates', async ({ page }) => {
    await clickEnd(content(page, 0), page)
    await page.keyboard.type('甲')
    await clickEnd(content(page, 1), page)
    await page.keyboard.type('乙')
    await clickEnd(line(page, '步驟之後的段落'), page)
    await page.keyboard.type('外')
    await clickEnd(content(page, 0), page)
    await page.keyboard.type('丙')
    // An update of the outer editor shouldn't pull the caret back out.
    await title(page, 1).fill('改標題')
    await clickEnd(content(page, 0), page)
    await page.keyboard.type('丁')
    await expect(content(page, 0)).toHaveText('先裝好相依套件。甲丙丁')
    await expect(content(page, 1)).toHaveText('再寫設定檔。乙')
    await expect(line(page, '步驟之後的段落外')).toBeVisible()
    await expect.poll(() => storedTexts(page)).toEqual(['先裝好相依套件。甲丙丁', '再寫設定檔。乙', '最後啟動。'])
  })

  test('the slash menu and format bar act on the step', async ({ page }) => {
    await clickEnd(content(page, 1), page)
    await page.keyboard.press('Enter')
    await page.keyboard.type('/')
    await expect(page.locator('.hlx-slash-menu')).toHaveCount(1)
    await expect(page.locator('.hlx-slash-item', { hasText: '步驟' })).toHaveCount(0)
    await expect(page.locator('.hlx-slash-item', { hasText: '註腳' })).toHaveCount(0)
    await page.keyboard.type('h2')
    await page.keyboard.press('Enter')
    await page.keyboard.type('小節')
    await expect(content(page, 1).locator('h2')).toHaveText('小節')
    await expect(editor(page).locator('> h2')).toHaveCount(0)

    await page.keyboard.press('ControlOrMeta+B')
    await page.keyboard.type('粗')
    await expect(content(page, 1).locator('strong')).toHaveText('粗')
  })

  test('the outer slash menu still has them', async ({ page }) => {
    await clickEnd(line(page, '步驟之後的段落'), page)
    await page.keyboard.press('Enter')
    await page.keyboard.type('/')
    await expect(page.locator('.hlx-slash-menu')).toHaveCount(1)
    await expect(page.locator('.hlx-slash-item', { hasText: '步驟' })).toHaveCount(1)
  })

  test('the top toolbar works on the step, and only history is left in its title', async ({ page }) => {
    const tool = (name: string) => page.locator('.hlx-fixed-toolbar').getByRole('button', { name, exact: true })
    await content(page, 0).click()
    await page.keyboard.press('ControlOrMeta+A')
    await tool('粗體').click()
    await expect(content(page, 0).locator('strong')).toHaveText('先裝好相依套件。')
    await expect(content(page, 0)).toBeFocused()
    await tool('插入').click()
    await expect(page.getByRole('menuitem', { name: '步驟' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    // The floating toolbar is over the title while the text is selected.
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('.hlx-floating-toolbar')).toHaveCount(0)
    await title(page, 0).click()
    await expect(tool('粗體')).toBeDisabled()
    await expect(tool('插入')).toBeDisabled()
    await expect(tool('復原')).toBeEnabled()
    await clickEnd(line(page, '步驟之後的段落'), page)
    await expect(tool('插入')).toBeEnabled()
  })
})

test.describe('history', () => {
  test.beforeEach(({ page }) => sample(page))

  test('goes through what happened in order, with focus following', async ({ page }) => {
    await clickEnd(line(page, '步驟之後的段落'), page)
    await page.keyboard.type('外')
    await clickEnd(content(page, 0), page)
    await page.keyboard.type('甲')
    await clickEnd(content(page, 1), page)
    await page.keyboard.type('乙')
    await title(page, 2).fill('新標題')
    await title(page, 2).press('Enter')
    await expect.poll(() => storedTitles(page)).toEqual(['安裝', '設定', '新標題'])

    await content(page, 2).click()
    await undo(page)
    await expect(title(page, 2)).toHaveValue('啟動')
    await undo(page)
    await expect(content(page, 1)).toHaveText('再寫設定檔。')
    await expect(content(page, 1)).toBeFocused()
    await undo(page)
    await expect(content(page, 0)).toHaveText('先裝好相依套件。')
    await expect(content(page, 0)).toBeFocused()
    await undo(page)
    await expect(line(page, '步驟之後的段落外')).toHaveCount(0)
    await expect(editor(page)).toBeFocused()

    await redo(page)
    await expect(line(page, '步驟之後的段落外')).toBeVisible()
    await redo(page)
    await expect(content(page, 0)).toHaveText('先裝好相依套件。甲')
    await redo(page)
    await expect(content(page, 1)).toHaveText('再寫設定檔。乙')
    await redo(page)
    await expect(title(page, 2)).toHaveValue('新標題')
  })

  test('brings back a deleted step with its content, and edits still reach it', async ({ page }) => {
    await clickEnd(content(page, 1), page)
    await page.keyboard.type('字')
    await action(page, 1, 'remove').click()
    await expect(page.locator('.hlx-step')).toHaveCount(2)
    await content(page, 0).click()
    await undo(page)
    await expect(page.locator('.hlx-step')).toHaveCount(3)
    await expect(content(page, 1)).toHaveText('再寫設定檔。字')
    await clickEnd(content(page, 1), page)
    await page.keyboard.type('又')
    await expect.poll(async () => (await storedTexts(page))[1]).toBe('再寫設定檔。字又')
  })

  test('brings back a deleted block', async ({ page }) => {
    await clickEnd(content(page, 0), page)
    await page.keyboard.type('字')
    await page.keyboard.press('Escape')
    await expect(block(page)).toHaveAttribute('data-selected', 'true')
    await page.keyboard.press('Delete')
    await expect(block(page)).toHaveCount(0)
    await undo(page)
    await expect(content(page, 0)).toHaveText('先裝好相依套件。字')
    await expect(title(page, 0)).toHaveValue('安裝')
    await clickEnd(content(page, 0), page)
    await page.keyboard.type('又')
    await expect.poll(async () => (await storedTexts(page))[0]).toBe('先裝好相依套件。字又')
  })
})

test.describe('the steps', () => {
  test.beforeEach(({ page }) => sample(page))

  test('adds, with focus on the new title', async ({ page }) => {
    await stepAt(page, 0).hover()
    await action(page, 0, 'add').click()
    await expect(page.locator('.hlx-step')).toHaveCount(4)
    await expect(title(page, 1)).toBeFocused()
    await page.keyboard.type('中間')
    await page.keyboard.press('Enter')
    await expect(content(page, 1)).toBeFocused()
    await expect.poll(() => storedTitles(page)).toEqual(['安裝', '中間', '設定', '啟動'])
  })

  test('moves, with the content along', async ({ page }) => {
    await stepAt(page, 0).hover()
    await action(page, 0, 'down').click()
    await expect.poll(() => storedTitles(page)).toEqual(['設定', '安裝', '啟動'])
    await expect(content(page, 0)).toHaveText('再寫設定檔。')
    await clickEnd(content(page, 1), page)
    await page.keyboard.type('字')
    await expect.poll(async () => (await storedTexts(page))[1]).toBe('先裝好相依套件。字')
  })

  test('leaves a blank step when the last goes', async ({ page }) => {
    for (const index of [2, 1, 0]) {
      await stepAt(page, index).hover()
      await action(page, index, 'remove').click()
    }
    await expect(page.locator('.hlx-step')).toHaveCount(1)
    await expect(title(page, 0)).toHaveValue('')
    await expect(content(page, 0)).toHaveText('')
  })

  test('clicking elsewhere saves a title, with the caret where it was clicked', async ({ page }) => {
    await title(page, 0).fill('新')
    await clickEnd(content(page, 1), page)
    await page.keyboard.type('字')
    await expect.poll(() => storedTitles(page)).toEqual(['新', '設定', '啟動'])
    await expect(content(page, 1)).toHaveText('再寫設定檔。字')
  })

  test('is read only with everything else', async ({ page }) => {
    await page.getByRole('checkbox', { name: '可編輯' }).uncheck()
    await expect(title(page, 0)).not.toBeEditable()
    await expect(content(page, 0)).toHaveAttribute('contenteditable', 'false')
    await expect(page.locator('.hlx-step [data-action]')).toHaveCount(0)
    await page.getByRole('checkbox', { name: '可編輯' }).check()
    await expect(content(page, 0)).toHaveAttribute('contenteditable', 'true')
  })
})

test.describe('the keyboard', () => {
  test.beforeEach(({ page }) => sample(page))

  test('walks in and through and out', async ({ page }) => {
    // 測試用文件 start closed.
    await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
      element.open = true
    })
    await page.getByRole('button', { name: '載入提及、嵌入和步驟' }).click()
    // At the line's start: its middle can be a mention, whose press opens its panel.
    await editor(page).locator('> p').first().click({
      position: { x: 2, y: 10 },
    })
    await toLineEnd(page)
    await page.keyboard.press('ArrowDown')
    await expect(title(page, 0)).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(content(page, 0)).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(title(page, 1)).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(content(page, 0)).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(title(page, 0)).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(editor(page)).toBeFocused()
    await page.keyboard.type('上')
    await expect(editor(page).locator('> p').first()).toContainText('上')
  })

  test('leaves past the last step, and comes back up', async ({ page }) => {
    await content(page, 2).click()
    await page.keyboard.press('ArrowDown')
    await expect(editor(page)).toBeFocused()
    await page.keyboard.type('下')
    await expect(editor(page).locator('> p', { hasText: '下步驟之後的段落' })).toBeVisible()
    await page.keyboard.press('ArrowUp')
    await expect(content(page, 2)).toBeFocused()
    await page.keyboard.type('尾')
    await expect(content(page, 2)).toContainText('尾')
  })

  test('Esc selects the block, and Enter goes back in', async ({ page }) => {
    await title(page, 1).click()
    await page.keyboard.press('Escape')
    await expect(block(page)).toHaveAttribute('data-selected', 'true')
    await page.keyboard.press('Enter')
    await expect(title(page, 0)).toBeFocused()
  })
})

test.describe('the block', () => {
  test.beforeEach(({ page }) => sample(page))

  test('moves from the handle and stays editable', async ({ page }) => {
    await page.locator('.hlx-step-number').first().hover()
    await page.locator('.hlx-block-grip').click()
    await page.locator('.hlx-block-menu').getByRole('menuitem', { name: '上移' }).click()
    await expect.poll(async () => (await stored(page))[0].type).toBe('steps')
    await expect(content(page, 0)).toHaveText('先裝好相依套件。')
    await clickEnd(content(page, 0), page)
    await page.keyboard.type('字')
    await expect.poll(async () => (await storedTexts(page))[0]).toBe('先裝好相依套件。字')
  })

  test('a copy from the handle can be edited apart', async ({ page }) => {
    await page.locator('.hlx-step-number').first().hover()
    await page.locator('.hlx-block-grip').click()
    await page.locator('.hlx-block-menu').getByRole('menuitem', { name: '複製' }).click()
    await expect(block(page)).toHaveCount(2)
    const copy = block(page).nth(1).locator('.hlx-step-content .hlx-content').first()
    await expect(copy).toHaveText('先裝好相依套件。')
    await clickEnd(copy, page)
    await page.keyboard.type('複本')
    await expect(copy).toHaveText('先裝好相依套件。複本')
    await expect(block(page).nth(0).locator('.hlx-step-content .hlx-content').first()).toHaveText('先裝好相依套件。')
  })

  test('copies and pastes, and the copy can be edited apart', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'only Chromium can grant clipboard permissions')
    await page.locator('.hlx-step-number').first().click()
    await expect(block(page)).toHaveAttribute('data-selected', 'true')
    await page.keyboard.press('ControlOrMeta+C')
    await clickEnd(line(page, '步驟之後的段落'), page)
    await page.keyboard.press('Enter')
    await page.keyboard.press('ControlOrMeta+V')
    await expect(block(page)).toHaveCount(2)
    const copy = block(page).nth(1).locator('.hlx-step-content .hlx-content').first()
    await clickEnd(copy, page)
    await page.keyboard.type('複本')
    await expect(copy).toHaveText('先裝好相依套件。複本')
    await expect(block(page).nth(0).locator('.hlx-step-content .hlx-content').first()).toHaveText('先裝好相依套件。')
  })
})

test('shows the same in the preview', async ({ page }) => {
  await sample(page)
  await page.getByRole('tab', { name: '預覽' }).click()
  const preview = page.locator('.editor-frame:visible')
  await expect(preview.locator('ol.hlx-steps > li.hlx-step')).toHaveCount(3)
  await expect(preview.locator('.hlx-step-title').first()).toHaveText('安裝')
  await expect(preview.locator('.hlx-step-content').first()).toHaveText('先裝好相依套件。')
})
