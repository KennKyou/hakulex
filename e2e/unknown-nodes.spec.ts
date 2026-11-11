import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { toLineEnd } from './keys'

const editor = (page: Page) => page.locator('.hlx-content').first()
const undo = (page: Page) => page.keyboard.press('ControlOrMeta+Z')
const placeholder = (page: Page, type: string) => editor(page).locator(`[data-unknown-type^="${type}"]`)
const line = (page: Page, text: string) => editor(page).locator('p', { hasText: text })

const poll = {
  type: 'excalidraw',
  version: 1,
  question: '午餐吃什麼？',
  options: [
    { id: 'a', label: '麵' },
  ],
}
const chip = {
  type: 'chip',
  version: 1,
  label: 'Ken',
}
const card = {
  type: 'container-x',
  version: 1,
  cols: 2,
  gap: 8,
  cells: [],
}

interface Json { type: string, text?: string, children?: Json[] }

/** What `v-model` handed the page. */
async function stored(page: Page): Promise<Json[]> {
  const text = await page.locator('details.json pre').textContent()
  return (JSON.parse(text!) as { root: { children: Json[] } }).root.children
}
const storedTypes = async (page: Page) => (await stored(page)).map(node => node.type)

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
  // 測試用文件 start closed.
  await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
    element.open = true
  })
  await page.getByRole('button', { name: '載入含未支援內容的文件' }).click()
  await expect(placeholder(page, 'excalidraw')).toBeVisible()
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

test('opens the document and shows what it can', async ({ page }) => {
  await expect(line(page, '一段可以編輯的文字')).toBeVisible()
  await expect(placeholder(page, 'excalidraw')).toContainText('excalidraw')
  await expect(placeholder(page, 'excalidraw')).not.toContainText('午餐吃什麼')
  await expect(placeholder(page, 'badge')).toHaveText('徽章')
  await expect(placeholder(page, 'chip')).toHaveText('chip')
})

test('keeps a very long type inside the page', async ({ page }) => {
  const box = await placeholder(page, 'a-very-long').boundingBox()
  const frame = await editor(page).boundingBox()
  expect(box!.x + box!.width).toBeLessThanOrEqual(frame!.x + frame!.width + 1)
})

test('gives back what it read after editing elsewhere', async ({ page }) => {
  await line(page, '一段可以編輯的文字').click()
  await toLineEnd(page)
  await page.keyboard.type('新')
  await expect(line(page, '一段可以編輯的文字新')).toBeVisible()
  await expect.poll(async () => JSON.stringify(await stored(page))).toContain('一段可以編輯的文字新')
  const children = await stored(page)
  expect(children[0]).toEqual(poll)
  expect(children[1].children?.[3]).toEqual(chip)
  expect(children.at(-1)).toEqual(card)
  expect(JSON.stringify(children)).not.toContain('hlx-unknown')
})

test.describe('block', () => {
  test('deletes with a click and Backspace, and comes back with undo', async ({ page }) => {
    await placeholder(page, 'container-x').click()
    await expect(placeholder(page, 'container-x')).toHaveAttribute('data-selected', 'true')
    await page.keyboard.press('Backspace')
    await expect(placeholder(page, 'container-x')).toHaveCount(0)
    await undo(page)
    await expect(placeholder(page, 'container-x')).toBeVisible()
    expect((await stored(page)).at(-1)).toEqual(card)
  })

  test('deletes with Delete too', async ({ page }) => {
    await placeholder(page, 'container-x').click()
    await page.keyboard.press('Delete')
    await expect(placeholder(page, 'container-x')).toHaveCount(0)
  })

  test('is reached by the arrow keys, and left by them', async ({ page }) => {
    await line(page, '一段可以編輯的文字').click()
    await page.keyboard.press('ArrowDown')
    await expect(placeholder(page, 'a-very-long')).toHaveAttribute('data-selected', 'true')
    await page.keyboard.press('ArrowUp')
    await expect(placeholder(page, 'a-very-long')).not.toHaveAttribute('data-selected', 'true')
    await page.keyboard.type('上')
    await expect(line(page, '上')).toBeVisible()
  })

  test('gets a line above when it is first', async ({ page }) => {
    await placeholder(page, 'excalidraw').click()
    await page.keyboard.press('ArrowUp')
    await page.keyboard.type('開頭')
    await expect(editor(page).locator('> *').first()).toHaveText('開頭')
  })

  test('gets a line below when it is last', async ({ page }) => {
    await placeholder(page, 'container-x').click()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.type('結尾')
    await expect(editor(page).locator('> *').last()).toHaveText('結尾')
  })

  test('gets a line from clicking below it', async ({ page }) => {
    const box = await editor(page).boundingBox()
    const last = await placeholder(page, 'container-x').boundingBox()
    expect(box!.y + box!.height).toBeGreaterThan(last!.y + last!.height + 4)
    await page.mouse.click(box!.x + 40, box!.y + box!.height - 2)
    await page.keyboard.type('結尾')
    await expect(editor(page).locator('> *').last()).toHaveText('結尾')
  })

  test('copies and moves from the handle, without an option to turn it', async ({ page }) => {
    const menu = page.locator('.hlx-block-menu')
    const open = async () => {
      await placeholder(page, 'excalidraw').first().hover()
      await page.locator('.hlx-block-grip').click()
      await expect(menu).toBeVisible()
    }
    await open()
    await expect(menu.getByRole('menuitemradio')).toHaveCount(0)
    await menu.getByRole('menuitem', { name: '下移' }).click()
    await expect.poll(async () => (await storedTypes(page)).slice(0, 2)).toEqual(['paragraph', 'excalidraw'])
    expect((await stored(page))[1]).toEqual(poll)

    await open()
    await menu.getByRole('menuitem', { name: '複製' }).click()
    await expect(placeholder(page, 'excalidraw')).toHaveCount(2)
    await expect.poll(async () => (await stored(page)).filter(node => node.type === 'excalidraw')).toEqual([poll, poll])
  })

  test('copies and pastes with its data', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'only Chromium can grant clipboard permissions')
    await placeholder(page, 'excalidraw').click()
    await page.keyboard.press('ControlOrMeta+C')
    await line(page, '一段可以編輯的文字').click()
    await toLineEnd(page)
    await page.keyboard.press('ControlOrMeta+V')
    await expect(placeholder(page, 'excalidraw')).toHaveCount(2)
    await expect.poll(async () => (await stored(page)).filter(node => node.type === 'excalidraw')).toEqual([poll, poll])
  })

  test('stays put when read only', async ({ page }) => {
    await page.getByRole('checkbox', { name: '可編輯' }).uncheck()
    await placeholder(page, 'excalidraw').click()
    await expect(placeholder(page, 'excalidraw')).not.toHaveAttribute('data-selected', 'true')
    // Not Backspace: outside anything editable, WebKit takes it as going back a page.
    await page.keyboard.press('Delete')
    await expect(placeholder(page, 'excalidraw')).toBeVisible()
  })
})

test.describe('inline', () => {
  test('lets the text around it be edited', async ({ page }) => {
    await line(page, '徽章').click()
    await toLineEnd(page)
    await page.keyboard.type('尾')
    await expect(line(page, '徽章')).toContainText('後尾')
    await expect(placeholder(page, 'chip')).toBeVisible()
    await expect(placeholder(page, 'badge')).toBeVisible()
  })

  test('goes with Backspace and comes back with undo', async ({ page }) => {
    await line(page, '徽章').click()
    await toLineEnd(page)
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Backspace')
    await expect(placeholder(page, 'chip')).toHaveCount(0)
    await expect(line(page, '徽章')).toContainText('中後')
    await undo(page)
    await expect(placeholder(page, 'chip')).toBeVisible()
    await expect.poll(async () => (await stored(page))[1].children?.[3]).toEqual(chip)
  })
})

test('shows the document in the preview too', async ({ page }) => {
  await page.getByRole('tab', { name: '預覽' }).click()
  await expect(page.locator('.editor-frame:visible')).toContainText('一段可以編輯的文字')
  await expect(page.locator('.editor-frame:visible')).toContainText('前')
})
